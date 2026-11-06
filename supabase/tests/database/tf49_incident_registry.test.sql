-- ============================================================================
-- TF-49: ทะเบียนประเภทเหตุ, cases.details และ case_sensitive_details
-- รัน: npx supabase test db
--
-- ตัวละคร
--   admin  แอดมิน
--   lead   หัวหน้าหน่วย U1          r1  กู้ภัย U1 ที่รับเคส S1
--   r3     กู้ภัย U1 ที่ไม่ได้รับเคส   lead2  หัวหน้าหน่วย U2 (จังหวัดเดียวกัน)
--   rep    ผู้แจ้งเคส S1
-- เคส
--   S1  r1 / หน่วย U1 รับแล้ว มีข้อมูลสุขภาพ
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(22);

-- ---------- ประเภทเหตุ ----------
select is(
  (select string_agg(code, ',' order by sort_order) from public.incident_types),
  'FLOOD,FIRE,ROAD_ACCIDENT,MEDICAL,WATER_RESCUE,COLLAPSE,ANIMAL,OTHER',
  'incident_types มีครบ 8 ประเภทตามลำดับในโค้ด'
);
select is(
  (select string_agg(code, ',' order by sort_order) from public.incident_types where is_enabled),
  'FLOOD,ROAD_ACCIDENT,ANIMAL',
  'เปิดให้เลือกได้ 3 ประเภทเหตุ (FLOOD, ROAD_ACCIDENT, ANIMAL) ใน TF-51'
);

-- ---------- cases ----------
select hasnt_column('public', 'cases', 'water_level', 'ลบคอลัมน์ water_level แล้ว ระดับน้ำอยู่ที่ details ที่เดียว');
select is(
  (select count(*)::int from public.cases where incident_type <> 'FLOOD'),
  0,
  'เคสเดิมทั้งหมดเป็น FLOOD'
);

insert into public.cases (id, case_code, urgency, lat, lng, landmark, province)
values ('e0000000-0000-0000-0000-000000000009', 'T-D1', 'RED', 13.76, 100.53, 'x', 'กรุงเทพมหานคร');
select is(
  (select incident_type || ' ' || details::text from public.cases where case_code = 'T-D1'),
  'FLOOD {}',
  'เคสที่ไม่ระบุประเภท = FLOOD และ details เริ่มเป็น {}'
);

select throws_ok(
  $$update public.cases set details = '{"phone":"0812345678"}' where case_code = 'T-D1'$$,
  '23514', null, 'details ห้ามมีเบอร์โทร'
);
select throws_ok(
  $$update public.cases set details = '{"name":"สมชาย"}' where case_code = 'T-D1'$$,
  '23514', null, 'details ห้ามมีชื่อ'
);
select throws_ok(
  $$update public.cases set details = '{"health":{"diabetes":true}}' where case_code = 'T-D1'$$,
  '23514', null, 'details ห้ามมีข้อมูลสุขภาพ'
);
select throws_ok(
  $$update public.cases set details = '{"waterLevel":"OCEAN"}' where case_code = 'T-D1'$$,
  '23514', null, 'details.waterLevel ต้องเป็นค่าระดับน้ำที่มีอยู่จริง'
);
select throws_ok(
  $$update public.cases set incident_type = 'TSUNAMI' where case_code = 'T-D1'$$,
  '23503', null, 'incident_type ต้องมีอยู่ใน incident_types'
);

-- ---------- create_sos_case() ----------
create function pg_temp.sos_payload(extra jsonb) returns jsonb language sql as $$
  select jsonb_build_object(
    'urgency', 'YELLOW', 'triageReasons', '["CANNOT_SELF_EVACUATE"]'::jsonb, 'lat', 14.5, 'lng', 100.9, 'landmark', 'หน้าวัด',
    'phone', '0899990049', 'name', 'ทดสอบ TF-49', 'adults', 1, 'needs', '[]'::jsonb
  ) || extra
$$;

-- เรียกฟังก์ชันแยกคำสั่ง: แถวที่ฟังก์ชันเพิ่มจะยังไม่เห็นใน query เดียวกัน
select lives_ok(
  $$select * from public.create_sos_case('tf49-flood', pg_temp.sos_payload('{"waterLevel":"ROOF"}'), 1000)$$,
  'create_sos_case: สร้างเคสน้ำท่วมได้ตามเดิม'
);
select is(
  (select incident_type || ' ' || (details ->> 'waterLevel') from public.cases where idempotency_key = 'tf49-flood'),
  'FLOOD ROOF',
  'create_sos_case: ไม่ส่งประเภท = FLOOD และระดับน้ำลง details.waterLevel'
);
select throws_ok(
  $$select * from public.create_sos_case('tf49-fire', pg_temp.sos_payload('{"incidentType":"FIRE","phone":"0899990050","lat":15.5}'), 1000)$$,
  '22023', null, 'create_sos_case: ประเภทที่ยังไม่เปิด (FIRE) สร้างเคสไม่ได้'
);
select throws_ok(
  $$select * from public.create_sos_case('tf49-unknown', pg_temp.sos_payload('{"incidentType":"TSUNAMI","phone":"0899990051","lat":16.5}'), 1000)$$,
  '22023', null, 'create_sos_case: ประเภทที่ไม่มีในทะเบียนสร้างเคสไม่ได้'
);

-- ---------- case_sensitive_details: RLS ----------
insert into auth.users (id) values
  ('a0000000-0000-0000-0000-000000000491'), ('a0000000-0000-0000-0000-000000000492'),
  ('a0000000-0000-0000-0000-000000000493'), ('a0000000-0000-0000-0000-000000000494'),
  ('a0000000-0000-0000-0000-000000000495'), ('a0000000-0000-0000-0000-000000000496');

insert into public.users (id, auth_user_id, line_user_id, display_name, role, status) values
  ('b0000000-0000-0000-0000-000000000491', 'a0000000-0000-0000-0000-000000000491', 'U49admin', 'admin', 'ADMIN', 'ACTIVE'),
  ('b0000000-0000-0000-0000-000000000492', 'a0000000-0000-0000-0000-000000000492', 'U49lead', 'lead', 'UNIT_LEAD', 'ACTIVE'),
  ('b0000000-0000-0000-0000-000000000493', 'a0000000-0000-0000-0000-000000000493', 'U49r1', 'r1', 'RESCUER', 'ACTIVE'),
  ('b0000000-0000-0000-0000-000000000494', 'a0000000-0000-0000-0000-000000000494', 'U49r3', 'r3', 'RESCUER', 'ACTIVE'),
  ('b0000000-0000-0000-0000-000000000495', 'a0000000-0000-0000-0000-000000000495', 'U49lead2', 'lead2', 'UNIT_LEAD', 'ACTIVE'),
  ('b0000000-0000-0000-0000-000000000496', 'a0000000-0000-0000-0000-000000000496', 'U49rep', 'rep', 'USER', 'ACTIVE');

insert into public.units (id, name, province) values
  ('c0000000-0000-0000-0000-000000000491', 'หน่วย 49-1', 'กรุงเทพมหานคร'),
  ('c0000000-0000-0000-0000-000000000492', 'หน่วย 49-2', 'กรุงเทพมหานคร');

insert into public.unit_members (user_id, unit_id, role_in_unit, status) values
  ('b0000000-0000-0000-0000-000000000492', 'c0000000-0000-0000-0000-000000000491', 'LEAD', 'APPROVED'),
  ('b0000000-0000-0000-0000-000000000493', 'c0000000-0000-0000-0000-000000000491', 'MEMBER', 'APPROVED'),
  ('b0000000-0000-0000-0000-000000000494', 'c0000000-0000-0000-0000-000000000491', 'MEMBER', 'APPROVED'),
  ('b0000000-0000-0000-0000-000000000495', 'c0000000-0000-0000-0000-000000000492', 'LEAD', 'APPROVED');

insert into public.cases (id, case_code, urgency, lat, lng, landmark, province,
                          reporter_user_id, assigned_rescuer_id, assigned_unit_id) values
  ('d0000000-0000-0000-0000-000000000491', 'T-S1', 'RED', 13.76, 100.53, 'x', 'กรุงเทพมหานคร',
   'b0000000-0000-0000-0000-000000000496', 'b0000000-0000-0000-0000-000000000493', 'c0000000-0000-0000-0000-000000000491');

insert into public.case_sensitive_details (case_id, details)
values ('d0000000-0000-0000-0000-000000000491', '{"conditions":["เบาหวาน"]}');

create function pg_temp.sensitive_rows() returns int language sql as $$
  select count(*)::int from public.case_sensitive_details
  where case_id = 'd0000000-0000-0000-0000-000000000491'
$$;
grant execute on all functions in schema pg_temp to anon, authenticated;

create function pg_temp.as_user(auth_id text) returns void language sql as $$
  select set_config('request.jwt.claims',
    jsonb_build_object('sub', auth_id, 'role', 'authenticated')::text, true)
$$;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok('select * from public.case_sensitive_details', '42501', null, 'ไม่ล็อกอิน: อ่านข้อมูลสุขภาพไม่ได้');
select is((select count(*)::int from public.incident_types), 8, 'ไม่ล็อกอิน: อ่านรายการประเภทเหตุได้');
reset role;

set local role authenticated;
select pg_temp.as_user('a0000000-0000-0000-0000-000000000493');
select is(pg_temp.sensitive_rows(), 1, 'กู้ภัยที่รับเคส: เห็นข้อมูลสุขภาพ');
select pg_temp.as_user('a0000000-0000-0000-0000-000000000492');
select is(pg_temp.sensitive_rows(), 1, 'หัวหน้าของหน่วยที่รับเคส: เห็นข้อมูลสุขภาพ');
select pg_temp.as_user('a0000000-0000-0000-0000-000000000491');
select is(pg_temp.sensitive_rows(), 1, 'แอดมิน: เห็นข้อมูลสุขภาพ');
select pg_temp.as_user('a0000000-0000-0000-0000-000000000494');
select is(pg_temp.sensitive_rows(), 0, 'กู้ภัยหน่วยเดียวกันที่ไม่ได้รับเคส: ไม่เห็น');
select pg_temp.as_user('a0000000-0000-0000-0000-000000000495');
select is(pg_temp.sensitive_rows(), 0, 'หัวหน้าหน่วยอื่นในจังหวัดเดียวกัน: ไม่เห็น');
select pg_temp.as_user('a0000000-0000-0000-0000-000000000496');
select is(pg_temp.sensitive_rows(), 0, 'ผู้แจ้ง (ผู้ใช้ทั่วไป): ไม่เห็นผ่านฐานข้อมูลตรงๆ');
reset role;

select * from finish();
rollback;
