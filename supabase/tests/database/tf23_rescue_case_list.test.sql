-- ============================================================================
-- TF-23: list_rescue_cases() — รายการเคสสำหรับกู้ภัย
-- รัน: npx supabase test db
--
-- ตัวละคร
--   r1  กู้ภัยหน่วย U1 (สมุทรสงคราม — จังหวัดที่ E2E ไม่ใช้ เคสค้างในเครื่องจะได้ไม่ปน)      r3  กู้ภัยหน่วย U3 (ภูเก็ต — ใช้ทดสอบเพดาน 100 แถว)
--   u   ผู้ใช้ทั่วไป (ไม่มีหน่วย)
-- เคสในสมุทรสงคราม (ผู้เรียกอยู่ที่ 13.41, 100.00)
--   A1 RED    NEW       ~1 กม.  สร้าง 1 ชม.ก่อน
--   A2 YELLOW NEW       ~8 กม.  สร้าง 2 ชม.ก่อน  score 200
--   A3 GREEN  NEW       ~15 กม. สร้าง 3 ชม.ก่อน
--   A4 YELLOW ACCEPTED  ~2 กม.  สร้าง 5 ชม.ก่อน  score 100
--   A5 RED    RESOLVED  (ปิดแล้ว ต้องไม่ขึ้น)
--   B1 RED    NEW       เชียงใหม่ (คนละจังหวัด ต้องไม่ขึ้น)
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(22);

insert into auth.users(id) values
  ('a2300000-0000-0000-0000-000000000001'),
  ('a2300000-0000-0000-0000-000000000003'),
  ('a2300000-0000-0000-0000-000000000009');
insert into public.users(id, auth_user_id, display_name, role, status) values
  ('b2300000-0000-0000-0000-000000000001', 'a2300000-0000-0000-0000-000000000001', 'r1', 'RESCUER', 'ACTIVE'),
  ('b2300000-0000-0000-0000-000000000003', 'a2300000-0000-0000-0000-000000000003', 'r3', 'RESCUER', 'ACTIVE'),
  ('b2300000-0000-0000-0000-000000000009', 'a2300000-0000-0000-0000-000000000009', 'u', 'USER', 'ACTIVE');
insert into public.units(id, name, province) values
  ('c2300000-0000-0000-0000-000000000001', 'TF23 U1', 'สมุทรสงคราม'),
  ('c2300000-0000-0000-0000-000000000003', 'TF23 U3', 'ภูเก็ต');
insert into public.unit_members(user_id, unit_id, role_in_unit, status) values
  ('b2300000-0000-0000-0000-000000000001', 'c2300000-0000-0000-0000-000000000001', 'MEMBER', 'APPROVED'),
  ('b2300000-0000-0000-0000-000000000003', 'c2300000-0000-0000-0000-000000000003', 'MEMBER', 'APPROVED');

insert into public.cases
  (id, case_code, urgency, status, priority_score, lat, lng, landmark, province, incident_type, notes, created_at, assigned_unit_id)
values
  ('d2300000-0000-0000-0000-0000000000a1', 'TF23-A1', 'RED', 'NEW', 300, 13.419, 100.00, 'หน้าวัด', 'สมุทรสงคราม', 'FLOOD', 'โน้ตลับTF23', now() - interval '1 hour', null),
  ('d2300000-0000-0000-0000-0000000000a2', 'TF23-A2', 'YELLOW', 'NEW', 200, 13.482, 100.00, 'หน้าวัด', 'สมุทรสงคราม', 'FLOOD', null, now() - interval '2 hours', null),
  ('d2300000-0000-0000-0000-0000000000a3', 'TF23-A3', 'GREEN', 'NEW', 50, 13.545, 100.00, 'หน้าวัด', 'สมุทรสงคราม', 'FLOOD', null, now() - interval '3 hours', null),
  ('d2300000-0000-0000-0000-0000000000a4', 'TF23-A4', 'YELLOW', 'ACCEPTED', 100, 13.428, 100.00, 'หน้าวัด', 'สมุทรสงคราม', 'FLOOD', null, now() - interval '5 hours', 'c2300000-0000-0000-0000-000000000001'),
  ('d2300000-0000-0000-0000-0000000000a5', 'TF23-A5', 'RED', 'RESOLVED', 999, 13.411, 100.00, 'หน้าวัด', 'สมุทรสงคราม', 'FLOOD', null, now() - interval '9 hours', null),
  ('d2300000-0000-0000-0000-0000000000b1', 'TF23-B1', 'RED', 'NEW', 999, 18.79, 98.98, 'หน้าวัด', 'เชียงใหม่', 'FLOOD', null, now() - interval '1 hour', null);

-- ข้อมูลส่วนตัวที่ต้องไม่หลุดไปหน้ารายการ
insert into public.case_contacts(case_id, name, phone, phone_last4, detailed_address)
  values ('d2300000-0000-0000-0000-0000000000a1', 'ชื่อลับTF23', '0899990231', '0231', 'ที่อยู่ลับTF23');
insert into public.case_sensitive_details(case_id, details)
  values ('d2300000-0000-0000-0000-0000000000a1', '{"dangerSigns":["UNCONSCIOUS"],"hasInjured":true}');
insert into public.case_people(case_id, adults, bedridden, children)
  values ('d2300000-0000-0000-0000-0000000000a1', 1, 1, 2);

-- 105 เคสในภูเก็ต สำหรับเพดาน 100 แถว
insert into public.cases (case_code, urgency, status, lat, lng, landmark, province, incident_type)
select 'TF23-BULK-' || g, 'YELLOW', 'NEW', 7.88 + g * 0.001, 98.39, 'bulk', 'ภูเก็ต', 'FLOOD'
from generate_series(1, 105) g;

create function pg_temp.codes(p_sort text, p_radius integer default null) returns text
language sql as $$
  select string_agg(case_code, ',' order by ord)
  from (
    select case_code, row_number() over () as ord
    from public.list_rescue_cases(13.41, 100.00, p_radius, p_sort)
  ) t
$$;

-- ---------- ไม่มีข้อมูลส่วนตัวในผลลัพธ์ ----------
select ok(
  pg_get_function_result(
    'public.list_rescue_cases(double precision,double precision,integer,text,numeric,numeric,numeric,uuid,integer)'::regprocedure
  ) !~* '(phone|line_id|detailed_address|notes|tracking_token|reporter|display_name|details)',
  'คอลัมน์ผลลัพธ์ไม่มีเบอร์ ชื่อ ที่อยู่ละเอียด โน้ต token หรือ details'
);
select ok(not has_function_privilege('anon',
  'public.list_rescue_cases(double precision,double precision,integer,text,numeric,numeric,numeric,uuid,integer)', 'execute'),
  'anon เรียกไม่ได้');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2300000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select ok(
  (select coalesce(json_agg(t)::text, '') from public.list_rescue_cases(13.41, 100.00) t)
    !~ '(0899990231|ชื่อลับTF23|ที่อยู่ลับTF23|UNCONSCIOUS|hasInjured|โน้ตลับTF23)',
  'ผลลัพธ์ไม่มีเบอร์ ชื่อ ที่อยู่ โน้ต หรือข้อมูลจาก case_sensitive_details'
);
select is(
  (select bedridden || ',' || children from public.list_rescue_cases(13.41, 100.00) where case_code = 'TF23-A1'),
  '1,2',
  'มีจำนวนผู้ป่วยติดเตียง/เด็กเล็กสำหรับป้าย'
);

-- ---------- RLS และเคสปิด ----------
select is(
  (select count(*)::int from public.list_rescue_cases(13.41, 100.00) where case_code = 'TF23-A5'),
  0, 'เคสที่ปิดแล้วไม่แสดง'
);
select is(
  (select count(*)::int from public.list_rescue_cases(13.41, 100.00) where case_code = 'TF23-B1'),
  0, 'เคสคนละจังหวัดไม่แสดง (RLS ของผู้เรียกทำงาน)'
);

-- ---------- เรียง 3 แบบ ----------
select is(pg_temp.codes('PRIORITY'), 'TF23-A1,TF23-A2,TF23-A4,TF23-A3',
  'PRIORITY: RED ก่อน แล้ว YELLOW ตามคะแนน แล้ว GREEN');
select is(pg_temp.codes('DISTANCE'), 'TF23-A1,TF23-A4,TF23-A2,TF23-A3',
  'DISTANCE: ใกล้ก่อน');
select is(pg_temp.codes('WAITING'), 'TF23-A3,TF23-A2,TF23-A1,TF23-A4',
  'WAITING: NEW ก่อนเสมอ เรียงรอนานสุด แล้วค่อยเป็นเคสที่มีคนรับแล้ว (A4 รอนานกว่าแต่รับแล้ว)');
select ok(
  (select round(distance_m) between 900 and 1100 from public.list_rescue_cases(13.41, 100.00) where case_code = 'TF23-A1'),
  'ระยะทางจากตำแหน่งผู้เรียกถูกต้อง (~1 กม.)'
);

-- ---------- รัศมี / ไม่มี GPS ----------
select is(pg_temp.codes('PRIORITY', 5000), 'TF23-A1,TF23-A4', 'รัศมี 5 กม.');
select is(pg_temp.codes('PRIORITY', 10000), 'TF23-A1,TF23-A2,TF23-A4', 'รัศมี 10 กม.');
select is(
  (select string_agg(case_code, ',' order by case_code) from public.list_rescue_cases()),
  'TF23-A1,TF23-A2,TF23-A3,TF23-A4',
  'ไม่มีพิกัด: ใช้จังหวัดของหน่วย'
);
select throws_ok($$select * from public.list_rescue_cases(null, null, null, 'DISTANCE')$$,
  '22023', null, 'เรียงตามระยะทางต้องมีพิกัด');

-- ---------- keyset + จำนวนทั้งหมด ----------
create temporary table page1 as
  select * from public.list_rescue_cases(13.41, 100.00, null, 'PRIORITY', p_limit => 2);
select is((select string_agg(case_code, ',' order by sort_k1::numeric, sort_k2::numeric, sort_k3::numeric, id) from page1),
  'TF23-A1,TF23-A2', 'หน้าแรก 2 แถว');
select is((select distinct total_count::int from page1), 4, 'บอกจำนวนทั้งหมดที่ตรงตัวกรอง');
create temporary table page2 as
  select p2.* from page1 last_row,
    lateral public.list_rescue_cases(13.41, 100.00, null, 'PRIORITY',
      last_row.sort_k1::numeric, last_row.sort_k2::numeric, last_row.sort_k3::numeric, last_row.id, 2) p2
  where last_row.case_code = 'TF23-A2';
select is((select string_agg(case_code, ',' order by sort_k1::numeric, sort_k2::numeric, sort_k3::numeric, id) from page2),
  'TF23-A4,TF23-A3', 'หน้าถัดไปต่อจากคีย์ของแถวสุดท้าย ไม่ซ้ำไม่ข้าม');
select is((select distinct total_count::int from page2), 4, 'จำนวนทั้งหมดเท่าเดิมทุกหน้า');

-- WAITING keyset ข้ามจาก NEW ไปเคสที่รับแล้วได้ถูก
select is(
  (select string_agg(p.case_code, ',')
     from (select * from public.list_rescue_cases(13.41, 100.00, null, 'WAITING', p_limit => 3)
           order by sort_k1::numeric desc, sort_k2::numeric desc, sort_k3::numeric desc, id desc limit 1) last_row,
     lateral public.list_rescue_cases(13.41, 100.00, null, 'WAITING',
       last_row.sort_k1::numeric, last_row.sort_k2::numeric, last_row.sort_k3::numeric, last_row.id, 3) p),
  'TF23-A4', 'WAITING หน้าถัดไปเป็นเคสที่มีคนรับแล้ว');

-- ---------- เพดาน 100 แถว ----------
select set_config('request.jwt.claims', '{"sub":"a2300000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is((select count(*)::int from public.list_rescue_cases(p_limit => 1000)), 100,
  'ขอเกิน 100 แถว ได้แค่ 100');
-- seed ของ TF-57 มีเคสตัวอย่างที่ยังเปิดอยู่ในภูเก็ต (หน่วยโชว์) รายการนับรวมด้วย
select is((select distinct total_count::int from public.list_rescue_cases()),
  105 + (select count(*)::int from public.cases where is_demo and province = 'ภูเก็ต'
         and status in ('NEW', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE')),
  'จำนวนทั้งหมดนับครบ 105 แม้ส่งกลับแค่ 100');

-- ---------- ผู้ใช้ทั่วไปเรียกไม่ได้ ----------
select set_config('request.jwt.claims', '{"sub":"a2300000-0000-0000-0000-000000000009","role":"authenticated"}', true);
select throws_ok($$select * from public.list_rescue_cases()$$, '42501', null,
  'ผู้ใช้ที่ไม่มีหน่วยเรียกไม่ได้');

select * from finish();
rollback;
