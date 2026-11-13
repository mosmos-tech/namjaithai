-- ============================================================================
-- TF-38: export รายการเคสเป็น CSV (admin_case_export) + ตัวกรองประเภทเหตุของสถิติ (admin_case_statistics)
-- เฉพาะแอดมิน, ไม่มีคอลัมน์ต้องห้าม, เขียน audit_logs ทุกครั้ง, ไม่รวม is_demo, จำกัดช่วงวันที่ 366 วัน
-- รัน: npx supabase test db
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(21);

-- 1 แอดมิน / 2 กู้ภัย / 3 หัวหน้าหน่วย / 4 ผู้ใช้ทั่วไป
insert into auth.users(id)
  select ('a3800000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid from generate_series(1, 4) g;
insert into public.users(id, auth_user_id, display_name, role, status, phone)
  select ('b3800000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
         ('a3800000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
         'TF38-' || g,
         (case g when 1 then 'ADMIN' when 2 then 'RESCUER' when 3 then 'UNIT_LEAD' else 'USER' end)::public.user_role,
         'ACTIVE', '08138000' || lpad(g::text, 2, '0')
  from generate_series(1, 4) g;
insert into public.units(id, name, province) values
  ('c3800000-0000-0000-0000-000000000001', 'TF38 หน่วยรับเคส', 'TF38 จังหวัด');
insert into public.units(id, name, province, source) values
  ('c3800000-0000-0000-0000-000000000002', 'TF38 หน่วยตัวอย่าง', 'TF38 จังหวัด', 'DEMO');

-- 2020-03-01 เวลาไทย = 2020-02-29 17:00 UTC
insert into public.cases(case_code, status, urgency, lat, lng, landmark, notes, province, district, subdistrict,
                         incident_type, created_at, assigned_unit_id, assigned_rescuer_id) values
  ('TF38-A', 'ACCEPTED', 'RED', 18.1, 100.1, 'บ้านสีแดง ลับมาก', 'โน้ตส่วนตัว', 'TF38 จังหวัด', 'อำเภอ ก', 'ตำบล ข',
   'FLOOD', '2020-02-29 17:00+00', 'c3800000-0000-0000-0000-000000000001', 'b3800000-0000-0000-0000-000000000002'),
  ('TF38-B', 'NEW', 'YELLOW', 18.2, 100.2, 'จุดที่สอง', null, 'TF38 จังหวัด', null, null,
   'FIRE', '2020-03-05 03:00+00', null, null),
  ('TF38-OUT', 'NEW', 'GREEN', 18.3, 100.3, 'นอกช่วง', null, 'TF38 จังหวัด', null, null,
   'FLOOD', '2020-02-29 16:59+00', null, null),
  ('TF38-ELSE', 'NEW', 'GREEN', 18.4, 100.4, 'จังหวัดอื่น', null, 'TF38 อื่น', null, null,
   'FLOOD', '2020-03-02 03:00+00', null, null);
insert into public.cases(case_code, status, urgency, lat, lng, landmark, province, incident_type, created_at,
                         is_demo, assigned_unit_id)
values ('TF38-DEMO', 'NEW', 'RED', 18.5, 100.5, 'เคสตัวอย่าง', 'TF38 จังหวัด', 'FLOOD', '2020-03-03 03:00+00',
        true, 'c3800000-0000-0000-0000-000000000002');
insert into public.case_contacts(case_id, name, phone, phone_last4)
  select id, 'ผู้แจ้งลับ', '0813800099', '0099' from public.cases where case_code = 'TF38-A';
update public.cases set reporter_locale = 'en' where case_code = 'TF38-B';

create function pg_temp.as_user(n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', 'a3800000-0000-0000-0000-' || lpad(n::text, 12, '0'), 'role', 'authenticated')::text,
    true);
$$;
create temp table export_result as select * from public.admin_case_export('2020-01-01', '2020-01-01') limit 0;
grant select, insert on export_result to authenticated;

-- ---------- 1. สิทธิ์: เฉพาะแอดมิน ----------
set local role authenticated;
select pg_temp.as_user(2);
select throws_ok($$select * from public.admin_case_export('2020-03-01', '2020-03-31')$$, '42501', null,
  'กู้ภัย export ไม่ได้');
select pg_temp.as_user(3);
select throws_ok($$select * from public.admin_case_export('2020-03-01', '2020-03-31')$$, '42501', null,
  'หัวหน้าหน่วย export ไม่ได้');
select pg_temp.as_user(4);
select throws_ok($$select * from public.admin_case_export('2020-03-01', '2020-03-31')$$, '42501', null,
  'ผู้ใช้ทั่วไป export ไม่ได้');
reset role;
select is((select count(*)::int from public.audit_logs where action = 'CASES_EXPORTED'
  and actor_user_id in ('b3800000-0000-0000-0000-000000000002', 'b3800000-0000-0000-0000-000000000003',
                        'b3800000-0000-0000-0000-000000000004')), 0,
  'ถูกปฏิเสธแล้วไม่มีแถว audit ปลอม');

-- ---------- 2. ช่วงวันที่ ----------
set local role authenticated;
select pg_temp.as_user(1);
select throws_ok($$select * from public.admin_case_export(null, '2020-03-31')$$, '22023', null,
  'ต้องระบุวันเริ่ม');
select throws_ok($$select * from public.admin_case_export('2020-03-31', '2020-03-01')$$, '22023', null,
  'วันเริ่มหลังวันสิ้นสุดไม่ได้');
select throws_ok($$select * from public.admin_case_export('2020-01-01', '2021-01-01')$$, '22023', null,
  'เกิน 366 วันไม่ได้');
select lives_ok($$select * from public.admin_case_export('2020-01-01', '2020-12-31')$$,
  '366 วันพอดี (ปีอธิกสุรทิน) ได้');

-- ---------- 3. ข้อมูลที่ได้ ----------
insert into export_result select * from public.admin_case_export('2020-03-01', '2020-03-31', 'TF38 จังหวัด');
reset role;
select is((select array_agg(case_code order by case_code) from export_result), array['TF38-A', 'TF38-B'],
  'ช่วงวันที่ตามเวลาไทยและจังหวัด · ไม่รวมเคสตัวอย่าง (TF-70)');
select is((select unit_name from export_result where case_code = 'TF38-A'), 'TF38 หน่วยรับเคส',
  'มีชื่อหน่วยที่รับเคส');
select is((select array_agg(reporter_locale order by case_code) from export_result), array['th', 'en'],
  'มีภาษาที่ผู้แจ้งใช้ (TF-63)');
select is(
  (select array_agg(a order by a) from unnest((select proargnames from pg_proc
     where oid = 'public.admin_case_export(date,date,text,text)'::regprocedure)) a where a not like 'p\_%'),
  array['case_code', 'close_confirmation', 'closed_at', 'created_at', 'district', 'incident_type',
        'province', 'reporter_locale', 'status', 'subdistrict', 'unit_name', 'urgency'],
  'คอลัมน์ที่คืนมีเฉพาะที่อนุญาต');
select ok(
  position('ผู้แจ้งลับ' in (select string_agg(to_jsonb(e)::text, '') from export_result e)) = 0
  and position('0813800099' in (select string_agg(to_jsonb(e)::text, '') from export_result e)) = 0,
  'ไม่มีชื่อ/เบอร์ผู้แจ้ง');
select ok(
  position('บ้านสีแดง ลับมาก' in (select string_agg(to_jsonb(e)::text, '') from export_result e)) = 0
  and position('โน้ตส่วนตัว' in (select string_agg(to_jsonb(e)::text, '') from export_result e)) = 0
  and position('18.1' in (select string_agg(to_jsonb(e)::text, '') from export_result e)) = 0,
  'ไม่มีจุดสังเกต/โน้ตที่ผู้แจ้งพิมพ์ และพิกัด');
select ok(position('b3800000-0000-0000-0000-000000000002' in
  (select string_agg(to_jsonb(e)::text, '') from export_result e)) = 0, 'ไม่มี user id ของกู้ภัย');

set local role authenticated;
select pg_temp.as_user(1);
select is((select array_agg(case_code) from public.admin_case_export('2020-03-01', '2020-03-31', 'TF38 จังหวัด', 'FIRE')),
  array['TF38-B'], 'ตัวกรองประเภทเหตุ');
reset role;

-- ---------- 4. audit_logs ทุกครั้ง ----------
select is((select count(*)::int from public.audit_logs where action = 'CASES_EXPORTED'
  and actor_user_id = 'b3800000-0000-0000-0000-000000000001'), 3,
  'export สำเร็จ 3 ครั้ง = audit 3 แถว');
select is(
  (select metadata from public.audit_logs where action = 'CASES_EXPORTED'
     and metadata ->> 'incidentType' = 'FIRE'),
  jsonb_build_object('from', '2020-03-01', 'to', '2020-03-31', 'province', 'TF38 จังหวัด',
                     'incidentType', 'FIRE', 'rowCount', 1),
  'audit เก็บตัวกรองและจำนวนแถว');
select is((select target_type from public.audit_logs where action = 'CASES_EXPORTED' limit 1), 'case_export',
  'audit target_type = case_export');

-- ---------- 5. สถิติ TF-33 รับประเภทเหตุ ----------
set local role authenticated;
select pg_temp.as_user(1);
select is((public.admin_case_statistics('TF38 จังหวัด', '2020-03-01', '2020-03-31', 'FIRE') -> 'incidents'),
  '[{"name": "FIRE", "count": 1}]'::jsonb, 'สถิติกรองตามประเภทเหตุ');
select is((select sum((x ->> 'count')::int)::int from jsonb_array_elements(
  public.admin_case_statistics('TF38 จังหวัด', '2020-03-01', '2020-03-31') -> 'incidents') x), 2,
  'เรียกแบบ 3 พารามิเตอร์เดิมยังนับทุกประเภทเหมือนเดิม');
reset role;

select * from finish();
rollback;
