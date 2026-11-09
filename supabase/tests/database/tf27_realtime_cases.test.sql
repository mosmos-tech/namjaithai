-- ============================================================================
-- TF-27: ตรวจสอบสิทธิ์ Realtime publication และ RLS ของตาราง public.cases
-- รัน: npx supabase test db
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(9);

-- ---------- ข้อมูลตั้งต้น ----------
insert into auth.users (id) values
  ('a2700000-0000-0000-0000-000000000001'), -- admin
  ('a2700000-0000-0000-0000-000000000002'), -- rescuer (สตูล)
  ('a2700000-0000-0000-0000-000000000003'), -- unit_lead (สตูล)
  ('a2700000-0000-0000-0000-000000000004'); -- reporter USER

insert into public.users (id, auth_user_id, line_user_id, display_name, role, status) values
  ('b2700000-0000-0000-0000-000000000001', 'a2700000-0000-0000-0000-000000000001', 'U27admin', 'admin', 'ADMIN', 'ACTIVE'),
  ('b2700000-0000-0000-0000-000000000002', 'a2700000-0000-0000-0000-000000000002', 'U27resc', 'rescuer', 'RESCUER', 'ACTIVE'),
  ('b2700000-0000-0000-0000-000000000003', 'a2700000-0000-0000-0000-000000000003', 'U27lead', 'lead', 'UNIT_LEAD', 'ACTIVE'),
  ('b2700000-0000-0000-0000-000000000004', 'a2700000-0000-0000-0000-000000000004', 'U27user', 'reporter', 'USER', 'ACTIVE');

insert into public.units (id, name, province) values
  ('c2700000-0000-0000-0000-000000000001', 'หน่วย สตูล TF27', 'สตูล');

insert into public.unit_members (user_id, unit_id, role_in_unit, status) values
  ('b2700000-0000-0000-0000-000000000002', 'c2700000-0000-0000-0000-000000000001', 'MEMBER', 'APPROVED'),
  ('b2700000-0000-0000-0000-000000000003', 'c2700000-0000-0000-0000-000000000001', 'LEAD', 'APPROVED');

insert into public.cases (id, case_code, urgency, lat, lng, landmark, province, reporter_user_id) values
  ('d2700000-0000-0000-0000-000000000001', 'TF27-SAT-OWN', 'RED', 6.62, 100.06, 'x', 'สตูล', 'b2700000-0000-0000-0000-000000000004'),
  ('d2700000-0000-0000-0000-000000000002', 'TF27-SAT-GUEST', 'YELLOW', 6.63, 100.07, 'y', 'สตูล', null),
  ('d2700000-0000-0000-0000-000000000003', 'TF27-TRG-OTHER', 'RED', 7.55, 99.61, 'z', 'ตรัง', null);

-- ---------- 1. Publication & ตารางข้อมูลลับ ----------
select ok(
  exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'cases'
  ),
  'public.cases อยู่ใน publication supabase_realtime'
);

select is(
  (
    select count(*)::int
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename in ('case_contacts', 'case_sensitive_details', 'case_media', 'users')
  ),
  0,
  'ตารางข้อมูลส่วนตัวและข้อมูลสุขภาพไม่อยู่ใน supabase_realtime'
);

-- ---------- 2. สิทธิ์ของ anon ----------
select ok(
  not has_table_privilege('anon', 'public.cases', 'SELECT'),
  'anon ไม่มีสิทธิ์ SELECT บน public.cases'
);

-- ---------- 3. RLS isolation สำหรับ Realtime ----------
set local role authenticated;

-- USER เห็นเฉพาะเคสที่ตัวเองแจ้งเท่านั้น
select set_config('request.jwt.claims', '{"sub":"a2700000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select is(
  (select string_agg(case_code, ',' order by case_code) from public.cases where case_code like 'TF27-%'),
  'TF27-SAT-OWN',
  'USER เห็นเฉพาะเคสของตัวเอง ไม่เห็นเคสของผู้แจ้งอื่น'
);

-- RESCUER เห็นเฉพาะเคสในจังหวัดของหน่วย (สตูล)
select set_config('request.jwt.claims', '{"sub":"a2700000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is(
  (select string_agg(case_code, ',' order by case_code) from public.cases where case_code like 'TF27-%'),
  'TF27-SAT-GUEST,TF27-SAT-OWN',
  'RESCUER เห็นเคสในจังหวัดของหน่วยเท่านั้น ไม่เห็นต่างจังหวัด'
);

-- UNIT_LEAD เห็นเฉพาะเคสในจังหวัดของหน่วย (สตูล)
select set_config('request.jwt.claims', '{"sub":"a2700000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is(
  (select string_agg(case_code, ',' order by case_code) from public.cases where case_code like 'TF27-%'),
  'TF27-SAT-GUEST,TF27-SAT-OWN',
  'UNIT_LEAD เห็นเคสในจังหวัดของหน่วยเท่านั้น'
);

-- ADMIN เห็นทุกเคส
select set_config('request.jwt.claims', '{"sub":"a2700000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(
  (select string_agg(case_code, ',' order by case_code) from public.cases where case_code like 'TF27-%'),
  'TF27-SAT-GUEST,TF27-SAT-OWN,TF27-TRG-OTHER',
  'ADMIN เห็นเคสทุกจังหวัด'
);

-- เมื่อเปลี่ยนสถานะเคสเป็น ACCEPTED กู้ภัยและแอดมินยังมองเห็นแถวที่อัปเดตได้
reset role;
update public.cases set status = 'ACCEPTED', assigned_unit_id = 'c2700000-0000-0000-0000-000000000001'
where id = 'd2700000-0000-0000-0000-000000000002';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2700000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is(
  (select status::text from public.cases where id = 'd2700000-0000-0000-0000-000000000002'),
  'ACCEPTED',
  'RESCUER มองเห็นสถานะเคสที่อัปเดตเป็น ACCEPTED'
);

select set_config('request.jwt.claims', '{"sub":"a2700000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.cases where id = 'd2700000-0000-0000-0000-000000000002'),
  0,
  'USER ยังคงไม่เห็นเคสคนอื่นแม้สถานะถูกอัปเดต'
);

select * from finish();
rollback;
