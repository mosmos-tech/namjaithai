-- ============================================================================
-- TF-20: ทดสอบคิวอนุมัติและระงับสมาชิก (สิทธิ์เข้าถึงเคส, อายุ 90 วัน, audit_logs, คิว LINE)
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(28);

-- 1. สิทธิ์การเรียกฟังก์ชันและตารางคิว LINE
select ok(
  not has_function_privilege('anon', 'public.review_unit_members(uuid,uuid[],public.unit_member_status)', 'execute'),
  'ผู้ไม่ล็อกอินเรียก review_unit_members ไม่ได้'
);
select ok(
  not has_function_privilege('anon', 'public.claim_member_line_notifications()', 'execute'),
  'ผู้ไม่ล็อกอินเรียก claim_member_line_notifications ไม่ได้'
);
select ok(
  not has_function_privilege('authenticated', 'public.claim_member_line_notifications()', 'execute'),
  'ผู้ใช้ทั่วไปเรียก claim_member_line_notifications ไม่ได้'
);

-- 2. เตรียมข้อมูลทดสอบ (ทำในฐานะ postgres)
insert into auth.users (id) values
  ('a2000000-0000-0000-0000-000000000001'), -- admin
  ('a2000000-0000-0000-0000-000000000002'), -- lead_u1 (กทม.)
  ('a2000000-0000-0000-0000-000000000003'), -- lead_u2 (เชียงใหม่)
  ('a2000000-0000-0000-0000-000000000004'), -- pend1 (ผู้สมัคร 1)
  ('a2000000-0000-0000-0000-000000000005'), -- pend2 (ผู้สมัคร 2)
  ('a2000000-0000-0000-0000-000000000006'); -- pend3 (ผู้สมัคร 3)

insert into public.users (id, auth_user_id, line_user_id, display_name, role, status) values
  ('b2000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'U' || repeat('1', 32), 'แอดมิน TF20', 'ADMIN', 'ACTIVE'),
  ('b2000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000002', 'U' || repeat('2', 32), 'หัวหน้า กทม.', 'UNIT_LEAD', 'ACTIVE'),
  ('b2000000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-000000000003', 'U' || repeat('3', 32), 'หัวหน้า เชียงใหม่', 'UNIT_LEAD', 'ACTIVE'),
  ('b2000000-0000-0000-0000-000000000004', 'a2000000-0000-0000-0000-000000000004', 'U' || repeat('4', 32), 'กู้ภัยสมัคร 1', 'RESCUER', 'ACTIVE'),
  ('b2000000-0000-0000-0000-000000000005', 'a2000000-0000-0000-0000-000000000005', 'U' || repeat('5', 32), 'กู้ภัยสมัคร 2', 'RESCUER', 'ACTIVE'),
  ('b2000000-0000-0000-0000-000000000006', 'a2000000-0000-0000-0000-000000000006', 'U' || repeat('6', 32), 'กู้ภัยสมัคร 3', 'RESCUER', 'ACTIVE');

insert into public.units (id, name, province) values
  ('c2000000-0000-0000-0000-000000000001', 'หน่วย กทม. TF20', 'กรุงเทพมหานคร'),
  ('c2000000-0000-0000-0000-000000000002', 'หน่วย เชียงใหม่ TF20', 'เชียงใหม่');

insert into public.unit_members (id, unit_id, user_id, role_in_unit, status) values
  ('d2000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002', 'LEAD', 'APPROVED'),
  ('d2000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000003', 'LEAD', 'APPROVED'),
  ('d2000000-0000-0000-0000-000000000003', 'c2000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000004', 'MEMBER', 'PENDING'),
  ('d2000000-0000-0000-0000-000000000004', 'c2000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000005', 'MEMBER', 'PENDING'),
  ('d2000000-0000-0000-0000-000000000005', 'c2000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000006', 'MEMBER', 'PENDING');

insert into public.cases (id, case_code, urgency, lat, lng, landmark, province, assigned_rescuer_id, assigned_unit_id) values
  ('e2000000-0000-0000-0000-000000000001', 'TF20-BKK', 'RED', 13.76, 100.53, 'จุดทดสอบ กทม.', 'กรุงเทพมหานคร', 'b2000000-0000-0000-0000-000000000004', 'c2000000-0000-0000-0000-000000000001'),
  ('e2000000-0000-0000-0000-000000000002', 'TF20-CNX', 'RED', 18.79, 98.99, 'จุดทดสอบ เชียงใหม่', 'เชียงใหม่', null, null);

insert into public.case_contacts (case_id, name, phone, phone_last4) values
  ('e2000000-0000-0000-0000-000000000001', 'ผู้ประสบภัย กทม.', '0811112222', '2222'),
  ('e2000000-0000-0000-0000-000000000002', 'ผู้ประสบภัย เชียงใหม่', '0833334444', '4444');

create function pg_temp.tf20_visible_cases() returns text language sql as $$
  select coalesce(string_agg(case_code, ',' order by case_code), '')
  from public.cases where case_code like 'TF20-%'
$$;
create function pg_temp.tf20_visible_contacts() returns text language sql as $$
  select coalesce(string_agg(c.case_code, ',' order by c.case_code), '')
  from public.case_contacts cc join public.cases c on c.id = cc.case_id where c.case_code like 'TF20-%'
$$;
grant execute on all functions in schema pg_temp to anon, authenticated;

-- 3. ขณะยังเป็น PENDING ต้องไม่เห็นเคสและข้อมูลติดต่อเลย
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select is(pg_temp.tf20_visible_cases(), '', 'ผู้สมัครที่ยังรออนุมัติ (PENDING) ต้องไม่เห็นเคสในหน่วย');
select is(pg_temp.tf20_visible_contacts(), '', 'ผู้สมัครที่ยังรออนุมัติต้องไม่เห็นเบอร์ผู้ประสบภัย');
select throws_ok(
  $$select * from public.review_unit_members(
    'c2000000-0000-0000-0000-000000000001',
    array['d2000000-0000-0000-0000-000000000003'::uuid],
    'APPROVED'
  )$$,
  '42501', null, 'ผู้สมัครอนุมัติตัวเองไม่ได้'
);
reset role;

-- 4. หัวหน้าหน่วยอื่น (เชียงใหม่) ต้องไม่เห็นสมาชิกหน่วย กทม. และอนุมัติข้ามหน่วยไม่ได้
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.unit_members where unit_id = 'c2000000-0000-0000-0000-000000000001'),
  0,
  'หัวหน้าหน่วยอื่นต้องไม่เห็นคิวรออนุมัติของหน่วย กทม.'
);
select throws_ok(
  $$select * from public.review_unit_members(
    'c2000000-0000-0000-0000-000000000001',
    array['d2000000-0000-0000-0000-000000000003'::uuid],
    'APPROVED'
  )$$,
  '42501', null, 'หัวหน้าหน่วยอื่นอนุมัติสมาชิกข้ามหน่วยไม่ได้'
);
reset role;

-- 5. หัวหน้าหน่วย กทม. เห็นคิวรออนุมัติ และกดอนุมัติหลายคนพร้อมกันได้ (pend1 + pend2)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.unit_members where unit_id = 'c2000000-0000-0000-0000-000000000001' and status = 'PENDING'),
  3,
  'หัวหน้าหน่วยเห็นผู้สมัครรออนุมัติในหน่วยตัวเองครบ 3 คน'
);
select is(
  (select count(*)::int from public.review_unit_members(
    'c2000000-0000-0000-0000-000000000001',
    array['d2000000-0000-0000-0000-000000000003'::uuid, 'd2000000-0000-0000-0000-000000000004'::uuid],
    'APPROVED'
  )),
  2,
  'หัวหน้าหน่วยกดอนุมัติพร้อมกันหลายคนได้'
);
select ok(
  (select expires_at between now() + interval '89 days 23 hours' and now() + interval '90 days 1 hour'
   from public.unit_members where id = 'd2000000-0000-0000-0000-000000000003'),
  'สิทธิ์ที่อนุมัติแล้วมีวันหมดอายุ 90 วัน'
);
select is(
  (select count(*)::int from public.audit_logs
   where action = 'MEMBER_APPROVED'
     and actor_user_id = 'b2000000-0000-0000-0000-000000000002'
     and target_id in ('d2000000-0000-0000-0000-000000000003', 'd2000000-0000-0000-0000-000000000004')),
  2,
  'หัวหน้าหน่วยเห็นบันทึก audit_logs ของการอนุมัติในหน่วยตัวเองครบทุกคน'
);
reset role;

-- 6. หลังอนุมัติ กู้ภัยเห็นเคสในพื้นที่หน่วยตัวเองทันที แต่ไม่เห็นเคสจังหวัดอื่น
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select is(pg_temp.tf20_visible_cases(), 'TF20-BKK', 'อนุมัติแล้วกู้ภัยเห็นเคสในพื้นที่หน่วยทันที และไม่เห็นเคสนอกพื้นที่');
select is(pg_temp.tf20_visible_contacts(), 'TF20-BKK', 'อนุมัติแล้วกู้ภัยเห็นข้อมูลติดต่อของเคสที่รับผิดชอบ');
select is((select count(*)::int from public.audit_logs), 0, 'กู้ภัยทั่วไปอ่าน audit_logs ไม่ได้');
reset role;

-- 7. หัวหน้าหน่วยปฏิเสธผู้สมัครคนที่ 3 (REJECTED) -> หลุดสิทธิ์ทันที + บันทึก audit_logs
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is(
  (select status::text from public.review_unit_members(
    'c2000000-0000-0000-0000-000000000001',
    array['d2000000-0000-0000-0000-000000000005'::uuid],
    'REJECTED'
  )),
  'REJECTED',
  'หัวหน้าหน่วยกดปฏิเสธคำขอได้'
);
select is(
  (select count(*)::int from public.audit_logs
   where action = 'MEMBER_REJECTED' and target_id = 'd2000000-0000-0000-0000-000000000005'),
  1,
  'การปฏิเสธสมาชิกถูกบันทึกใน audit_logs'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select is((select role::text from public.users where id = 'b2000000-0000-0000-0000-000000000006'), 'USER',
  'ผู้ที่ถูกปฏิเสธถูกลดบทบาทกลับเป็น USER ทันที');
select is(pg_temp.tf20_visible_cases(), '', 'ผู้ที่ถูกปฏิเสธต้องไม่เห็นเคสใดเลย');
reset role;

-- 8. หัวหน้าหน่วยระงับสมาชิกที่อนุมัติแล้ว (SUSPENDED) -> หลุดสิทธิ์ทันที + บันทึก audit_logs
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is(
  (select status::text from public.review_unit_members(
    'c2000000-0000-0000-0000-000000000001',
    array['d2000000-0000-0000-0000-000000000003'::uuid],
    'SUSPENDED'
  )),
  'SUSPENDED',
  'หัวหน้าหน่วยกดระงับสมาชิกได้'
);
select is(
  (select count(*)::int from public.audit_logs
   where action = 'MEMBER_SUSPENDED' and target_id = 'd2000000-0000-0000-0000-000000000003'),
  1,
  'การระงับสมาชิกถูกบันทึกใน audit_logs'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select is((select role::text from public.users where id = 'b2000000-0000-0000-0000-000000000004'), 'USER',
  'สมาชิกที่ถูกระงับถูกลดบทบาทกลับเป็น USER ทันที');
select is(pg_temp.tf20_visible_cases(), '', 'สมาชิกที่ถูกระงับหลุดสิทธิ์การเห็นเคสทันที แม้เคยได้รับมอบหมายเคสนั้น');
select is(pg_temp.tf20_visible_contacts(), '', 'สมาชิกที่ถูกระงับหลุดสิทธิ์การเห็นเบอร์ผู้ประสบภัยทันที');
reset role;

-- 9. สิทธิ์หมดอายุเมื่อครบ 90 วัน -> หลุดสิทธิ์ทันที
update public.unit_members
set expires_at = now() - interval '1 minute'
where id = 'd2000000-0000-0000-0000-000000000004';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select is(pg_temp.tf20_visible_cases(), '', 'สมาชิกที่ครบกำหนดหมดอายุ 90 วัน ต้องไม่เห็นเคสในหน่วยอีกต่อไป');
reset role;

-- 10. หัวหน้าหน่วยอื่นต้องไม่เห็น audit_logs ของหน่วย กทม.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.audit_logs where target_type = 'unit_member'),
  0,
  'หัวหน้าหน่วยอื่นต้องไม่เห็น audit_logs ของหน่วยอื่น'
);
reset role;

-- 11. ตรวจสอบคิวแจ้งผลทาง LINE (APPROVED 2 + REJECTED 1 + SUSPENDED 1 = 4 รายการ)
set local role service_role;
select is(
  (select count(*)::int from public.member_line_notifications
   where unit_id = 'c2000000-0000-0000-0000-000000000001'),
  4,
  'สร้างงานแจ้งเตือนทาง LINE ครบทุกการอนุมัติ ปฏิเสธ และระงับ'
);
select is(
  (select count(*)::int from public.claim_member_line_notifications()
   where unit_name = 'หน่วย กทม. TF20'),
  3,
  'worker ดึงงานแจ้งเตือนสมาชิกแต่ละคนตามลำดับโดยไม่ข้ามขั้นของคนเดียวกัน'
);
reset role;

select * from finish();
rollback;
