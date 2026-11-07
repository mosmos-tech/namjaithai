begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(33);

select has_table('public', 'organizations', 'มีตารางองค์กร');
select has_column('public', 'units', 'organization_id', 'หน่วยผูกกับองค์กรได้');
select has_column('public', 'units', 'branch_name', 'หน่วยมีชื่อสาขา');
select has_column('public', 'units', 'source', 'หน่วยมีที่มา');
select has_column('public', 'cases', 'is_demo', 'ระบุเคสตัวอย่างได้');
select is((select count(*)::int from public.organizations where is_demo), 4, 'มี 4 องค์กรสมมติ');
select is((select count(*)::int from public.units where source = 'DEMO'), 77, 'มีหน่วยตัวอย่าง 77 หน่วย');
select is((select count(distinct province)::int from public.units where source = 'DEMO'), 77, 'หน่วยตัวอย่างครอบคลุมทุกจังหวัด');
select is((select count(*)::int from public.provinces p where not exists (select 1 from public.units u where u.source = 'DEMO' and u.province = p.name_th)), 0, 'ไม่มีจังหวัดที่ขาดหน่วยตัวอย่าง');
select is((select count(*)::int from public.organizations o where o.is_demo and (select count(distinct u.province) from public.units u where u.organization_id = o.id and u.source = 'DEMO') > 1), 4, 'ทุกองค์กรตัวอย่างมีสาขาต่างจังหวัด');
select is((select count(*)::int from public.units where source = 'DEMO' and (name not like '%สมมติ%' or name not like '%ตัวอย่าง%' or is_active)), 0, 'หน่วยตัวอย่างมีชื่อสมมติและไม่รับงานจริง');
select is((select count(*)::int from public.cases where is_demo), 367, 'มีเคสตัวอย่างหนึ่งรายการต่อวัน');
select is((select count(distinct (created_at at time zone 'Asia/Bangkok')::date)::int from public.cases where is_demo and (created_at at time zone 'Asia/Bangkok')::date between (now() at time zone 'Asia/Bangkok')::date - 29 and (now() at time zone 'Asia/Bangkok')::date), 30, 'มีข้อมูลทุกวันใน 30 วันล่าสุด');
select ok((select min((created_at at time zone 'Asia/Bangkok')::date) <= ((now() at time zone 'Asia/Bangkok')::date - interval '12 months')::date from public.cases where is_demo), 'ข้อมูลย้อนหลังอย่างน้อย 12 เดือน');
select is((select count(*)::int from public.cases c left join public.units u on u.id = c.assigned_unit_id where c.is_demo and (u.id is null or u.source <> 'DEMO')), 0, 'เคสตัวอย่างผูกเฉพาะหน่วย DEMO');
select is((select count(*)::int from public.cases where is_demo and (created_at > now() or resolved_at > now())), 0, 'เคสตัวอย่างไม่อยู่ในอนาคต');
select ok(not has_table_privilege('anon', 'public.organizations', 'SELECT'), 'ผู้ไม่ล็อกอินอ่านรายชื่อองค์กรไม่ได้');
select ok(has_table_privilege('authenticated', 'public.organizations', 'SELECT'), 'ผู้ล็อกอินมีสิทธิ์อ่านองค์กรผ่าน RLS');
select throws_ok($$insert into public.units(name, province, source) values ('bad', 'test', 'INVALID')$$, '23514', null, 'ปฏิเสธ source ที่ไม่รองรับ');
select lives_ok($$insert into public.units(name, province, source) values ('TF56 OSM', 'TF56 province', 'OSM')$$, 'รองรับหน่วยจาก OSM');
insert into public.units(name, province) values ('TF56 default source', 'TF56 province');
select is((select source from public.units where name = 'TF56 default source'), 'ADMIN', 'หน่วยที่สร้างปกติใช้ source ADMIN');
select throws_ok($$delete from public.units where id = (select assigned_unit_id from public.cases where is_demo limit 1)$$, '23514', 'demo cases require a DEMO unit', 'ลบหน่วยตัวอย่างที่ยังมีเคสผูกอยู่ไม่ได้');
select throws_ok($$insert into public.units(name, province, district, branch_name, organization_id) select 'duplicate', province, district, branch_name, organization_id from public.units where source = 'DEMO' limit 1$$, '23505', null, 'ห้ามสาขาซ้ำในองค์กรและพื้นที่เดียวกัน');
insert into public.units(id, name, province, source) values ('f5600000-0000-4000-8000-000000000001', 'หน่วยทดสอบ', 'ทดสอบ', 'ADMIN');
select throws_ok($$insert into public.cases(case_code, urgency, lat, lng, province, landmark, is_demo, assigned_unit_id) values ('TF56-INVALID', 'GREEN', 13.75, 100.5, 'ทดสอบ', 'ทดสอบ', true, 'f5600000-0000-4000-8000-000000000001')$$, '23514', 'demo cases require a DEMO unit', 'ห้ามเคสตัวอย่างผูกหน่วยจริง');
select throws_ok($$update public.units set source = 'ADMIN' where id = (select assigned_unit_id from public.cases where is_demo limit 1)$$, '23514', 'unit with demo cases must remain DEMO', 'ห้ามเปลี่ยนที่มาของหน่วยที่มีเคสตัวอย่าง');
select is((select sum((province->>'rescued')::int)::bigint from jsonb_array_elements(public.public_situation_summary()->'provinces') province),
  (select coalesce(sum(rescued_count),0)::bigint from public.cases where not is_demo and status = 'RESOLVED' and province is not null and resolved_at >= date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok'),
  'กระดานสถานการณ์จริงไม่นับเคสสมมติ');

-- Nulls in district and branch cannot create duplicate branches within an organization.
select lives_ok($$insert into public.units(name, province, district, branch_name, organization_id) values ('TF56 null 1', 'TF56 province', null, null, 'd5600000-0000-4000-8000-000000000001')$$, 'สร้างสาขาที่ไม่ได้ระบุเขตและชื่อได้');
select throws_ok($$insert into public.units(name, province, district, branch_name, organization_id) values ('TF56 null 2', 'TF56 province', null, null, 'd5600000-0000-4000-8000-000000000001')$$, '23505', null, 'ห้ามสาขาซ้ำแม้เขตและชื่อเป็น null');

insert into auth.users(id) values ('a5600000-0000-4000-8000-000000000001'), ('a5600000-0000-4000-8000-000000000002');
insert into public.users(id, auth_user_id, display_name, role, status) values
  ('b5600000-0000-4000-8000-000000000001','a5600000-0000-4000-8000-000000000001','TF56 admin','ADMIN','ACTIVE'),
  ('b5600000-0000-4000-8000-000000000002','a5600000-0000-4000-8000-000000000002','TF56 user','USER','ACTIVE');
-- Even an activated demo unit with an on-duty member is not a real online team.
create temporary table tf56_live_before as
  select public.public_situation_summary() as summary;
update public.units set is_active = true where id = (select id from public.units where source = 'DEMO' order by id limit 1);
insert into public.unit_members(unit_id, user_id, role_in_unit, status, is_on_duty, duty_status)
select id, 'b5600000-0000-4000-8000-000000000002', 'MEMBER', 'APPROVED', true, 'AVAILABLE' from public.units where source = 'DEMO' order by id limit 1;
select is(public.public_situation_summary(), (select summary from tf56_live_before), 'กระดานจริงไม่นับหน่วยตัวอย่างแม้เปิดใช้งานและมีสมาชิกออนไลน์');
set local role anon;
select throws_ok($$select * from public.organizations$$, '42501', null, 'ผู้ไม่ล็อกอินอ่านองค์กรไม่ได้จริง');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a5600000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*)::int from public.organizations where is_demo), 4, 'ผู้ใช้ที่ล็อกอินเห็นองค์กรตัวอย่าง');
select throws_ok($$insert into public.organizations(name) values ('TF56 unauthorized')$$, '42501', null, 'ผู้ใช้ทั่วไปสร้างองค์กรไม่ได้');
select set_config('request.jwt.claims','{"sub":"a5600000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$insert into public.organizations(name) values ('TF56 admin organization')$$, 'แอดมินสร้างองค์กรได้');
reset role;
select * from finish();
rollback;
