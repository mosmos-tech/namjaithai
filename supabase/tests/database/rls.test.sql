-- ============================================================================
-- TF-18: ทดสอบ Row Level Security ตามเกณฑ์ผ่านของการ์ด
-- รัน: npx supabase test db   (ทุกอย่างอยู่ใน transaction แล้ว rollback ไม่ทิ้งข้อมูลไว้)
--
-- ตัวละคร
--   admin   แอดมิน
--   lead    หัวหน้าหน่วย กทม. (U1)
--   r1      กู้ภัยหน่วย กทม. (U1)
--   r2      กู้ภัยหน่วย เชียงใหม่ (U2)
--   pend    สมัครหน่วย กทม. แต่ยังรออนุมัติ
--   susp    กู้ภัย กทม. ที่บัญชีถูกระงับ
--   rep     ผู้ใช้ทั่วไปที่แจ้งเคส C1
-- เคส
--   C1 กทม. ผู้แจ้ง rep, r1 รับแล้ว     C2 กทม. ยังไม่มีคนรับ
--   C3 เชียงใหม่ ยังไม่มีคนรับ          C4 เชียงใหม่ แต่มอบให้ r1 (นอกพื้นที่)
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(32);

-- ---------- ข้อมูลตั้งต้น (ทำในฐานะ postgres ข้าม RLS) ----------
insert into auth.users (id) values
  ('a0000000-0000-0000-0000-000000000001'), ('a0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000000003'), ('a0000000-0000-0000-0000-000000000004'),
  ('a0000000-0000-0000-0000-000000000005'), ('a0000000-0000-0000-0000-000000000006'),
  ('a0000000-0000-0000-0000-000000000007');

insert into public.users (id, auth_user_id, line_user_id, display_name, role, status) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Uadmin', 'admin', 'ADMIN', 'ACTIVE'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'Ulead', 'lead', 'UNIT_LEAD', 'ACTIVE'),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', 'Ur1', 'r1', 'RESCUER', 'ACTIVE'),
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000004', 'Ur2', 'r2', 'RESCUER', 'ACTIVE'),
  ('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000005', 'Upend', 'pend', 'RESCUER', 'ACTIVE'),
  ('b0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000006', 'Ususp', 'susp', 'RESCUER', 'SUSPENDED'),
  ('b0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000007', 'Urep', 'rep', 'USER', 'ACTIVE');

insert into public.units (id, name, province) values
  ('c0000000-0000-0000-0000-000000000001', 'หน่วย กทม.', 'กรุงเทพมหานคร'),
  ('c0000000-0000-0000-0000-000000000002', 'หน่วย เชียงใหม่', 'เชียงใหม่');

insert into public.unit_members (user_id, unit_id, role_in_unit, status) values
  ('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'LEAD', 'APPROVED'),
  ('b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'MEMBER', 'APPROVED'),
  ('b0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002', 'MEMBER', 'APPROVED'),
  ('b0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001', 'MEMBER', 'PENDING'),
  ('b0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000001', 'MEMBER', 'APPROVED');

insert into public.cases (id, case_code, urgency, lat, lng, landmark, province,
                          reporter_user_id, assigned_rescuer_id, assigned_unit_id) values
  ('d0000000-0000-0000-0000-000000000001', 'T-C1', 'RED', 13.76, 100.53, 'x', 'กรุงเทพมหานคร',
   'b0000000-0000-0000-0000-000000000007', 'b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000002', 'T-C2', 'RED', 13.76, 100.53, 'x', 'กรุงเทพมหานคร', null, null, null),
  ('d0000000-0000-0000-0000-000000000003', 'T-C3', 'RED', 18.79, 98.99, 'x', 'เชียงใหม่', null, null, null),
  ('d0000000-0000-0000-0000-000000000004', 'T-C4', 'RED', 18.79, 98.99, 'x', 'เชียงใหม่',
   null, 'b0000000-0000-0000-0000-000000000003', null);

insert into public.case_contacts (case_id, name, phone, phone_last4)
select id, 'ผู้ประสบภัย ' || case_code, '0812345678', '5678' from public.cases where case_code like 'T-C%';

insert into public.case_people (case_id, adults)
select id, 1 from public.cases where case_code like 'T-C%';

insert into public.audit_logs (action, target_type) values ('TEST', 'case');

-- เคสที่ผู้ใช้คนนั้นเห็น (เฉพาะเคสทดสอบ ไม่ปนกับข้อมูลอื่นในเครื่อง)
create function pg_temp.visible_cases() returns text language sql as $$
  select coalesce(string_agg(case_code, ',' order by case_code), '') from public.cases where case_code like 'T-C%'
$$;
create function pg_temp.visible_contacts() returns text language sql as $$
  select coalesce(string_agg(c.case_code, ',' order by c.case_code), '')
  from public.case_contacts cc join public.cases c on c.id = cc.case_id where c.case_code like 'T-C%'
$$;
-- จำนวนแถวที่คำสั่ง update ทำได้จริง (RLS กรองแถวที่ไม่มีสิทธิ์ออกเงียบๆ จะได้ 0)
create function pg_temp.rows_affected(sql text) returns int language plpgsql as $$
declare n int;
begin
  execute sql;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

-- ============================================================================
-- เกณฑ์: ผู้ไม่ล็อกอินอ่านตาราง cases ตรงๆ ไม่ได้
-- ============================================================================
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok('select * from public.cases', '42501', null, 'ไม่ล็อกอิน: อ่าน cases ไม่ได้');
select throws_ok('select * from public.case_contacts', '42501', null, 'ไม่ล็อกอิน: อ่านข้อมูลติดต่อไม่ได้');
select throws_ok('select * from public.users', '42501', null, 'ไม่ล็อกอิน: อ่านรายชื่อผู้ใช้ไม่ได้');
reset role;

-- ============================================================================
-- เกณฑ์: ผู้ใช้ทั่วไปเห็นเฉพาะเคสที่ตัวเองแจ้ง
-- ============================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000007","role":"authenticated"}', true);
select is(pg_temp.visible_cases(), 'T-C1', 'ผู้ใช้ทั่วไป: เห็นแค่เคสที่ตัวเองแจ้ง');
select is(pg_temp.visible_contacts(), 'T-C1', 'ผู้ใช้ทั่วไป: เห็นข้อมูลติดต่อของเคสตัวเองเท่านั้น');
select is((select count(*)::int from public.audit_logs), 0, 'ผู้ใช้ทั่วไป: อ่าน audit_logs ไม่ได้');
reset role;

-- ============================================================================
-- เกณฑ์: กู้ภัยเห็นเคสเฉพาะพื้นที่ของหน่วย (+ เคสที่ได้รับมอบ) และเห็นข้อมูลส่วนตัวเฉพาะเคสที่ตัวเองรับ
-- ============================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is(pg_temp.visible_cases(), 'T-C1,T-C2,T-C4', 'กู้ภัย กทม.: เห็นเคส กทม. + เคสเชียงใหม่ที่มอบให้ตัวเอง ไม่เห็น C3');
select is(pg_temp.visible_contacts(), 'T-C1,T-C4', 'กู้ภัย กทม.: เห็นชื่อ/เบอร์เฉพาะเคสที่ตัวเองรับ (C2 ยังไม่รับ → ไม่เห็น)');
select is((select count(*)::int from public.case_people p join public.cases c on c.id = p.case_id where c.case_code = 'T-C3'), 0,
  'กู้ภัย กทม.: เห็นจำนวนคนของเคสนอกพื้นที่ไม่ได้');
select throws_ok($$update public.cases set status = 'ACCEPTED' where case_code = 'T-C2'$$, '42501', null,
  'กู้ภัย: เปลี่ยนสถานะเคสตรงๆ ไม่ได้ (ต้องผ่านฟังก์ชันรับเคส TF-25)');
select is((select count(*)::int from public.audit_logs), 0, 'กู้ภัย: อ่าน audit_logs ไม่ได้');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select is(pg_temp.visible_cases(), 'T-C3,T-C4', 'กู้ภัย เชียงใหม่: เห็นเฉพาะเคสในเชียงใหม่ (รวม C4 ที่หน่วยอื่นรับไปแล้ว) ไม่เห็นเคส กทม.');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select is(pg_temp.visible_cases(), '', 'สมาชิกที่รออนุมัติ: ยังไม่เห็นเคสใดเลย');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select is(pg_temp.visible_cases(), '', 'บัญชีถูกระงับ: ไม่เห็นเคสใดเลย');
reset role;

-- ============================================================================
-- เกณฑ์: หัวหน้าแก้สมาชิกและมอบหมายงานได้เฉพาะหน่วยตัวเอง
-- ============================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is(pg_temp.visible_cases(), 'T-C1,T-C2', 'หัวหน้า กทม.: เห็นเคส กทม.');
select is(pg_temp.visible_contacts(), '', 'หัวหน้า: ไม่เห็นชื่อ/เบอร์ผู้ประสบภัย (เห็นเฉพาะกู้ภัยที่รับเคส)');

select is(
  pg_temp.rows_affected($$update public.unit_members set duty_status = 'EN_ROUTE' where user_id = 'b0000000-0000-0000-0000-000000000003'$$), 1, 'หัวหน้า: แก้สถานะสมาชิกในหน่วยตัวเองได้');
select is(
  pg_temp.rows_affected($$update public.unit_members set status = 'SUSPENDED' where user_id = 'b0000000-0000-0000-0000-000000000004'$$), 0, 'หัวหน้า: แก้สมาชิกหน่วยอื่นไม่ได้');
select throws_ok(
  $$update public.unit_members set unit_id = 'c0000000-0000-0000-0000-000000000002'
    where user_id = 'b0000000-0000-0000-0000-000000000003'$$,
  '42501', null, 'หัวหน้า: ย้ายสมาชิกไปหน่วยอื่นไม่ได้');
select throws_ok(
  $$insert into public.unit_members (user_id, unit_id, status)
    values ('b0000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000001', 'APPROVED')$$,
  '42501', null, 'หัวหน้า: ดึงคนเข้าหน่วยเองไม่ได้ (ต้องผ่านลิงก์เชิญ)');

select is(
  pg_temp.rows_affected($$update public.cases set assigned_unit_id = 'c0000000-0000-0000-0000-000000000001', assigned_rescuer_id = 'b0000000-0000-0000-0000-000000000003' where case_code = 'T-C2'$$), 1, 'หัวหน้า: มอบเคสในพื้นที่ให้ลูกทีมตัวเองได้');
select throws_ok(
  $$update public.cases set assigned_rescuer_id = 'b0000000-0000-0000-0000-000000000004' where case_code = 'T-C2'$$,
  '42501', null, 'หัวหน้า: มอบเคสให้กู้ภัยหน่วยอื่นไม่ได้');
select is(
  pg_temp.rows_affected($$update public.cases set assigned_unit_id = 'c0000000-0000-0000-0000-000000000001' where case_code = 'T-C3'$$), 0, 'หัวหน้า: มอบเคสนอกพื้นที่หน่วยไม่ได้');
select is(pg_temp.rows_affected($$update public.units set province = 'เชียงใหม่' where name = 'หน่วย กทม.'$$), 0,
  'หัวหน้า: เปลี่ยนจังหวัดของหน่วยเพื่อขยายพื้นที่ไม่ได้');
reset role;

-- ============================================================================
-- เกณฑ์: แอดมินเห็นทุกพื้นที่ / audit_logs แก้หรือลบไม่ได้ แม้แต่แอดมิน
-- ============================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(pg_temp.visible_cases(), 'T-C1,T-C2,T-C3,T-C4', 'แอดมิน: เห็นเคสทุกพื้นที่');
select is(pg_temp.visible_contacts(), 'T-C1,T-C2,T-C3,T-C4', 'แอดมิน: เห็นข้อมูลติดต่อทุกเคส');
select ok((select count(*) from public.audit_logs where action = 'TEST') = 1, 'แอดมิน: อ่าน audit_logs ได้');
select throws_ok($$update public.audit_logs set action = 'X'$$, '42501', null, 'แอดมิน: แก้ audit_logs ไม่ได้');
select throws_ok($$delete from public.audit_logs$$, '42501', null, 'แอดมิน: ลบ audit_logs ไม่ได้');
select throws_ok($$truncate public.audit_logs$$, '42501', null, 'แอดมิน: ล้าง audit_logs ทั้งตารางไม่ได้');
reset role;

-- แม้แต่เซิร์ฟเวอร์ (postgres / service_role ที่ข้าม RLS) ก็แก้/ลบ/ล้าง audit_logs ไม่ได้ (trigger)
select throws_ok($$update public.audit_logs set action = 'X'$$, '42501', null, 'เซิร์ฟเวอร์: แก้ audit_logs ไม่ได้');
select throws_ok($$truncate public.audit_logs$$, '42501', null, 'เซิร์ฟเวอร์: ล้าง audit_logs ไม่ได้');

select * from finish();
rollback;
