-- TF-19: ลิงก์สมัครใช้ครั้งเดียวตามโควตา และสร้างสมาชิก PENDING แบบอะตอมมิก
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(13);

select ok(not has_function_privilege('anon', 'public.join_unit_with_invite(text,uuid)', 'execute'),
  'ผู้ไม่ล็อกอินเรียกฟังก์ชันใช้ลิงก์ไม่ได้');
select ok(not has_function_privilege('authenticated', 'public.join_unit_with_invite(text,uuid)', 'execute'),
  'ผู้ใช้ที่ล็อกอินเรียกฟังก์ชันใช้ลิงก์ตรงๆ ไม่ได้');

insert into auth.users (id) values
  ('a1900000-0000-0000-0000-000000000001'),
  ('a1900000-0000-0000-0000-000000000002'),
  ('a1900000-0000-0000-0000-000000000003');
insert into public.users (id, auth_user_id, line_user_id, display_name, role) values
  ('b1900000-0000-0000-0000-000000000001', 'a1900000-0000-0000-0000-000000000001', 'TF19-join', 'ผู้สมัคร', 'USER'),
  ('b1900000-0000-0000-0000-000000000002', 'a1900000-0000-0000-0000-000000000002', 'TF19-full', 'ผู้สมัครสอง', 'USER'),
  ('b1900000-0000-0000-0000-000000000003', 'a1900000-0000-0000-0000-000000000003', 'TF19-suspended', 'ผู้สมัครถูกระงับ', 'USER');
update public.users set status = 'SUSPENDED' where id = 'b1900000-0000-0000-0000-000000000003';
insert into public.units (id, name, province) values
  ('c1900000-0000-0000-0000-000000000001', 'หน่วยทดสอบ TF-19', 'กรุงเทพมหานคร');
insert into public.invites (id, unit_id, token, created_by, max_uses, expires_at) values
  ('d1900000-0000-0000-0000-000000000001', 'c1900000-0000-0000-0000-000000000001', repeat('a', 64), 'b1900000-0000-0000-0000-000000000001', 2, now() + interval '1 day'),
  ('d1900000-0000-0000-0000-000000000002', 'c1900000-0000-0000-0000-000000000001', repeat('b', 64), 'b1900000-0000-0000-0000-000000000001', 1, now() - interval '1 day'),
  ('d1900000-0000-0000-0000-000000000003', 'c1900000-0000-0000-0000-000000000001', repeat('c', 64), 'b1900000-0000-0000-0000-000000000001', 1, now() + interval '1 day'),
  ('d1900000-0000-0000-0000-000000000004', 'c1900000-0000-0000-0000-000000000001', repeat('d', 64), 'b1900000-0000-0000-0000-000000000001', 1, now() + interval '1 day');
update public.invites set is_active = false, revoked_at = now() where id = 'd1900000-0000-0000-0000-000000000003';
update public.invites set used_count = 1 where id = 'd1900000-0000-0000-0000-000000000004';

set local role service_role;
select is(public.join_unit_with_invite(repeat('a', 64), 'b1900000-0000-0000-0000-000000000001')->>'status', 'PENDING',
  'ลิงก์ที่ใช้งานได้สร้างสมาชิกสถานะรออนุมัติ');
select is((select status::text from public.unit_members where user_id = 'b1900000-0000-0000-0000-000000000001'), 'PENDING',
  'คำขอถูกผูกกับหน่วยในสถานะ PENDING');
select is((select role::text from public.users where id = 'b1900000-0000-0000-0000-000000000001'), 'RESCUER',
  'ผู้สมัครได้รับบทบาทกู้ภัยโดยไม่ต้องกรอกฟอร์ม');
select is((select used_count from public.invites where id = 'd1900000-0000-0000-0000-000000000001'), 1,
  'เพิ่มตัวนับการใช้ลิงก์หนึ่งครั้ง');
select is(public.join_unit_with_invite(repeat('a', 64), 'b1900000-0000-0000-0000-000000000001')->>'already_member', 'true',
  'ใช้ซ้ำโดยสมาชิกเดิมไม่สร้างสมาชิกซ้ำ');
select is((select used_count from public.invites where id = 'd1900000-0000-0000-0000-000000000001'), 1,
  'สมาชิกเดิมไม่ใช้โควตาซ้ำ');
select throws_ok($$select public.join_unit_with_invite(repeat('a', 64), 'b1900000-0000-0000-0000-000000000003')$$,
  'P0001', 'user unavailable', 'บัญชีที่ถูกระงับเข้าหน่วยผ่านลิงก์ไม่ได้');
select is((select count(*)::int from public.unit_members where user_id = 'b1900000-0000-0000-0000-000000000003'), 0,
  'บัญชีที่ถูกระงับไม่ถูกผูกกับหน่วย');
select throws_ok($$select public.join_unit_with_invite(repeat('b', 64), 'b1900000-0000-0000-0000-000000000002')$$,
  'P0001', 'invite unavailable', 'ลิงก์หมดอายุใช้ไม่ได้');
select throws_ok($$select public.join_unit_with_invite(repeat('c', 64), 'b1900000-0000-0000-0000-000000000002')$$,
  'P0001', 'invite unavailable', 'ลิงก์ถูกยกเลิกใช้ไม่ได้');
select throws_ok($$select public.join_unit_with_invite(repeat('d', 64), 'b1900000-0000-0000-0000-000000000002')$$,
  'P0001', 'invite unavailable', 'ลิงก์ที่ใช้ครบจำนวนแล้วใช้ไม่ได้');

reset role;
select * from finish();
rollback;
