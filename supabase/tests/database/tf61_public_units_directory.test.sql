-- ============================================================================
-- TF-61: RPC สาธารณะของหน้า /units — anon ได้แค่คอลัมน์ที่กำหนด ไม่มีข้อมูลเคส ผู้แจ้ง หรือสมาชิก
-- รัน: npx supabase test db
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(23);

-- ---------- 1. คอลัมน์ขาออกตรงตามที่กำหนดพอดี ----------
select is(pg_get_function_result('public.public_unit_directory()'::regprocedure),
  'TABLE(id uuid, organization_name text, branch_name text, district text, province text, '
  'capabilities text[], source text, in_service boolean, hotline text, helped_total integer)',
  'public_unit_directory ส่งแค่ ชื่อองค์กร ศูนย์ อำเภอ จังหวัด ความสามารถ source สายด่วน และยอดรวม');
select is(pg_get_function_result('public.public_unit_profile(uuid)'::regprocedure),
  'TABLE(id uuid, organization_name text, branch_name text, district text, province text, '
  'capabilities text[], source text, in_service boolean, hotline text, helped_total integer, '
  'lead_closed_total integer, helped_30d integer, lead_closed_30d integer, people_helped integer, '
  'active_count integer)',
  'public_unit_profile เพิ่มแค่ตัวเลขสรุป ไม่มีรายเคส');

-- ---------- 2. สิทธิ์ของ anon ----------
select ok(has_function_privilege('anon', 'public.public_unit_directory()', 'execute'), 'anon เรียกรายชื่อหน่วยได้');
select ok(has_function_privilege('anon', 'public.public_unit_profile(uuid)', 'execute'), 'anon เรียกข้อมูลหน่วยได้');
select ok(has_function_privilege('anon', 'public.public_unit_daily_helped(uuid, integer)', 'execute'),
  'anon เรียกกราฟรายวันของ TF-57 ได้');
select ok(not has_table_privilege('anon', 'public.units', 'select'), 'anon อ่านตาราง units ตรงไม่ได้');
select ok(not has_table_privilege('anon', 'public.cases', 'select'), 'anon อ่านตาราง cases ตรงไม่ได้');
select ok(not has_table_privilege('anon', 'public.unit_capabilities', 'select'), 'anon อ่านตาราง unit_capabilities ตรงไม่ได้');
select ok(not has_table_privilege('anon', 'public.unit_members', 'select'), 'anon อ่านสมาชิกหน่วยตรงไม่ได้');

-- ---------- 3. ข้อมูลทดสอบ ----------
-- หน่วย ADMIN ใช้งาน (เบอร์ส่วนตัว) / ADMIN ปิดใช้งาน / OSM ยังไม่ใช้ระบบ (สายด่วน)
insert into public.units(id, name, branch_name, province, district, contact_phone, source, is_active, osm_id) values
  ('c6100000-0000-0000-0000-000000000001', 'TF61 หน่วยจริง', null, 'ตราด', 'เมืองตราด', '0812345678', 'ADMIN', true, null),
  ('c6100000-0000-0000-0000-000000000002', 'TF61 หน่วยปิดแล้ว', null, 'ตราด', 'เมืองตราด', null, 'ADMIN', false, null),
  ('c6100000-0000-0000-0000-000000000003', 'TF61 มูลนิธิ OSM', 'TF61 ศูนย์ OSM', 'ตราด', 'เกาะช้าง', '1554', 'OSM', false, 'node/610000001');
insert into public.unit_capabilities(unit_id, capability) values
  ('c6100000-0000-0000-0000-000000000001', 'BOAT'), ('c6100000-0000-0000-0000-000000000001', 'EMS');

-- เคสที่ยังไม่ปิดของหน่วยจริง (มีพิกัด/ที่อยู่/ผู้แจ้ง — ต้องไม่หลุด)
insert into public.cases(id, case_code, urgency, status, lat, lng, landmark, province, incident_type, assigned_unit_id)
values ('d6100000-0000-0000-0000-000000000001', 'TF61-ACTIVE', 'YELLOW', 'NEW', 12.24, 102.51,
        'TF61 บ้านเลขที่ลับ', 'ตราด', 'FLOOD', null);
update public.cases set status = 'ACCEPTED', assigned_unit_id = 'c6100000-0000-0000-0000-000000000001'
  where id = 'd6100000-0000-0000-0000-000000000001';

set local role anon;

-- ---------- 4. หน่วยที่แสดง ----------
select ok(exists (select 1 from public.public_unit_directory() where id = 'c6100000-0000-0000-0000-000000000001'),
  'หน่วย ADMIN ที่ใช้งานอยู่ขึ้นรายชื่อ');
select ok(not exists (select 1 from public.public_unit_directory() where id = 'c6100000-0000-0000-0000-000000000002'),
  'หน่วย ADMIN ที่ปิดใช้งานไม่ขึ้นรายชื่อ');
select is((select count(*)::int from public.public_unit_profile('c6100000-0000-0000-0000-000000000002')), 0,
  'เปิดข้อมูลหน่วยที่ปิดใช้งานไม่ได้');
select is((select in_service from public.public_unit_directory() where id = 'c6100000-0000-0000-0000-000000000003'), false,
  'หน่วย OSM ที่ยังไม่ใช้ระบบขึ้นรายชื่อ (in_service = false)');
select ok((select count(*) from public.public_unit_directory() where source = 'DEMO') > 0,
  'หน่วยตัวอย่างขึ้นรายชื่อ (หน้าเว็บติดป้าย)');

-- ---------- 5. ค่าที่ส่งออก ----------
select is((select capabilities from public.public_unit_directory() where id = 'c6100000-0000-0000-0000-000000000001'),
  array['BOAT', 'EMS'], 'ความสามารถของหน่วยเรียงตามชื่อ');
select is((select hotline from public.public_unit_directory() where id = 'c6100000-0000-0000-0000-000000000001'), null,
  'หน่วย ADMIN ไม่ส่งเบอร์ (อาจเป็นเบอร์ส่วนตัว)');
select is((select hotline from public.public_unit_directory() where id = 'c6100000-0000-0000-0000-000000000003'), '1554',
  'หน่วย OSM ส่งสายด่วนได้');
select is((select branch_name from public.public_unit_directory() where id = 'c6100000-0000-0000-0000-000000000001'),
  'TF61 หน่วยจริง', 'ไม่มีชื่อศูนย์ใช้ชื่อหน่วยแทน');
select is((select active_count from public.public_unit_profile('c6100000-0000-0000-0000-000000000001')), 1,
  'กำลังช่วยนับเคสที่หน่วยถืออยู่ (ตัวเลขอย่างเดียว)');
select ok(not exists (
    select 1 from public.public_unit_profile('c6100000-0000-0000-0000-000000000001') p
    where row_to_json(p)::text ~ '(TF61-ACTIVE|บ้านเลขที่ลับ|12\.24|102\.51|0812345678)'),
  'ข้อมูลหน่วยไม่มีรหัสเคส ที่อยู่ พิกัด หรือเบอร์ส่วนตัว');

-- ---------- 6. ยอดนับเฉพาะเคสที่ผ่านด่าน TF-57 (ตรงกับ view ของ dashboard) ----------
reset role;
select is((select helped_total from public.public_unit_directory() where id = 'd5630000-0000-4000-8000-000000000001'),
  (select coalesce(sum(helped), 0)::int from rls.unit_case_outcomes where unit_id = 'd5630000-0000-4000-8000-000000000001'),
  'ยอดรวมของหน่วยโชว์เท่ากับ rls.unit_case_outcomes (ผ่านด่านแล้ว ผู้แจ้งยืนยันเท่านั้น)');
select is((select helped_30d from public.public_unit_profile('d5630000-0000-4000-8000-000000000001')),
  (select sum(helped)::int from public.public_unit_daily_helped('d5630000-0000-4000-8000-000000000001', 30)),
  'ช่วยสำเร็จ 30 วัน เท่ากับผลรวมแท่งกราฟ 30 วัน');
select ok((select helped_total from public.public_unit_directory() where id = 'd5630000-0000-4000-8000-000000000001')
  < (select count(*) from public.cases where assigned_unit_id = 'd5630000-0000-4000-8000-000000000001'
       and close_confirmation = 'REPORTER_CONFIRMED'),
  'เคสที่ติดด่านกันปั๊มผลงานใน seed ไม่ถูกนับ');

select * from finish();
rollback;
