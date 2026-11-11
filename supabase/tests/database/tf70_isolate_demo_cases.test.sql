-- ============================================================================
-- TF-70: เคสตัวอย่าง (is_demo) แยกจากงานจริง
-- ไม่เข้าคิว LINE, ไม่ขึ้นรายการกู้ภัย, รับ/ปล่อย/เลื่อนสถานะไม่ได้, คิวหัวหน้า/คิวตรวจผลงานไม่มี,
-- เปลี่ยน is_demo ไม่ได้, seed ไม่ทิ้งเคสตัวอย่างไว้ในคิว — ผลงานหน่วยยังนับเคสตัวอย่าง
-- รัน: npx supabase test db
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(19);

-- ---------- 1. seed ----------
select is((select count(*)::int from public.cases where case_code like 'DEMO-%' and not is_demo), 0,
  'เคสจาก seed ทุกเคสเป็น is_demo');
select is((select count(*)::int from public.line_red_case_queue q join public.cases c on c.id = q.case_id where c.is_demo), 0,
  'seed ไม่ทิ้งเคสตัวอย่างไว้ในคิว LINE เคสแดง');
select is((select count(*)::int from public.case_line_notifications n join public.cases c on c.id = n.case_id where c.is_demo), 0,
  'seed ไม่ทิ้งเคสตัวอย่างไว้ในคิว LINE ถึงผู้แจ้ง');

-- ผู้ใช้: 1 กู้ภัยหน่วยจริงในภูเก็ต (จังหวัดเดียวกับหน่วยโชว์) / 2 แอดมิน / 3 ผู้แจ้ง (LINE)
insert into auth.users(id)
  select ('a7000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid from generate_series(1, 3) g;
insert into public.users(id, auth_user_id, display_name, role, status, line_user_id)
  select ('b7000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
         ('a7000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
         'tf70-' || g,
         (case g when 2 then 'ADMIN' when 3 then 'USER' else 'RESCUER' end)::public.user_role,
         'ACTIVE', 'U' || lpad(to_hex(7000 + g), 32, '0')
  from generate_series(1, 3) g;
insert into public.units(id, name, province) values ('c7000000-0000-0000-0000-000000000001', 'TF70 หน่วยจริง', 'ภูเก็ต');
insert into public.unit_members(unit_id, user_id, role_in_unit, status) values
  ('c7000000-0000-0000-0000-000000000001', 'b7000000-0000-0000-0000-000000000001', 'MEMBER', 'APPROVED');

create function pg_temp.as_user(n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', 'a7000000-0000-0000-0000-' || lpad(n::text, 12, '0'), 'role', 'authenticated')::text,
    true);
$$;
grant execute on function pg_temp.as_user(int) to authenticated;

-- ---------- 2. LINE: insert / เปลี่ยนสถานะเคสตัวอย่างไม่เข้าคิว ----------
insert into public.cases(id, case_code, urgency, status, lat, lng, landmark, province, incident_type, is_demo,
                         assigned_unit_id, reporter_user_id)
values
  ('d7000000-0000-0000-0000-000000000001', 'TF70-DEMO-RED', 'RED', 'NEW', 7.88, 98.39, 'จุดสมมติ', 'ภูเก็ต', 'FLOOD', true,
   'd5630000-0000-4000-8000-000000000004', 'b7000000-0000-0000-0000-000000000003'),
  ('d7000000-0000-0000-0000-000000000002', 'TF70-REAL-RED', 'RED', 'NEW', 7.88, 98.39, 'หน้าวัด', 'ภูเก็ต', 'FLOOD', false,
   null, 'b7000000-0000-0000-0000-000000000003');
select is((select count(*)::int from public.line_red_case_queue where case_id = 'd7000000-0000-0000-0000-000000000001'), 0,
  'insert เคสตัวอย่างสีแดงไม่เข้าคิว LINE เคสแดง');
select is((select count(*)::int from public.line_red_case_queue where case_id = 'd7000000-0000-0000-0000-000000000002'), 1,
  'เคสจริงสีแดงยังเข้าคิวตามปกติ');
update public.cases set status = 'ACCEPTED' where id = 'd7000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.case_line_notifications where case_id = 'd7000000-0000-0000-0000-000000000001'), 0,
  'เปลี่ยนสถานะเคสตัวอย่างไม่ส่ง LINE ถึงผู้แจ้ง');
update public.cases set status = 'EN_ROUTE' where id = 'd7000000-0000-0000-0000-000000000001';
update public.cases set status = 'ON_SITE' where id = 'd7000000-0000-0000-0000-000000000001';
update public.cases set status = 'AWAITING_CONFIRMATION', last_status_updated_at = now() - interval '30 hours'
  where id = 'd7000000-0000-0000-0000-000000000001';
select is(public.enqueue_close_confirmation('d7000000-0000-0000-0000-000000000001'), false,
  'ขอให้ผู้แจ้งยืนยันปิดเคสตัวอย่างไม่เข้าคิว');

-- ---------- 3. is_demo เปลี่ยนไม่ได้ ----------
select throws_ok($$update public.cases set is_demo = false where id = 'd7000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'เปลี่ยนเคสตัวอย่างเป็นเคสจริงไม่ได้');
select throws_ok($$update public.cases set is_demo = true where id = 'd7000000-0000-0000-0000-000000000002'$$,
  '23514', null, 'เปลี่ยนเคสจริงเป็นเคสตัวอย่างไม่ได้');

-- ---------- 4. กู้ภัยมองไม่เห็นและรับไม่ได้ ----------
set local role authenticated;
select pg_temp.as_user(1);
select is((select count(*)::int from public.list_rescue_cases() where case_code like 'DEMO-%' or case_code = 'TF70-DEMO-RED'), 0,
  'list_rescue_cases ไม่คืนเคสตัวอย่าง (กู้ภัยจังหวัดเดียวกับหน่วยโชว์)');
select ok((select count(*) from public.list_rescue_cases() where case_code = 'TF70-REAL-RED') = 1,
  'เคสจริงในจังหวัดเดียวกันยังขึ้นรายการ');
select is((select count(*)::int from public.cases where is_demo), 0, 'RLS: กู้ภัยอ่านเคสตัวอย่างไม่ได้ (Realtime ส่งตาม RLS)');
select throws_ok($$select public.accept_case('d7000000-0000-0000-0000-000000000001', 1)$$, '42501', null,
  'กู้ภัยรับเคสตัวอย่างไม่ได้');
select throws_ok($$select public.advance_case_status('d7000000-0000-0000-0000-000000000001', 1, 'RESOLVED')$$, '42501', null,
  'กู้ภัยเลื่อนสถานะเคสตัวอย่างไม่ได้');

-- ---------- 5. แอดมิน: เห็นได้แต่ไม่ขึ้นรายการ/คิว และปล่อยไม่ได้ ----------
select pg_temp.as_user(2);
select is((select count(*)::int from public.list_rescue_cases() where case_code like 'DEMO-%' or case_code = 'TF70-DEMO-RED'), 0,
  'list_rescue_cases ไม่คืนเคสตัวอย่างแม้เป็นแอดมิน');
select throws_ok($$select public.release_case('d7000000-0000-0000-0000-000000000001',
    (select version from public.cases where id = 'd7000000-0000-0000-0000-000000000001'), 'ทดสอบปล่อย')$$,
  '22023', null, 'แอดมินปล่อยเคสตัวอย่างไม่ได้');
select is((select count(*)::int from jsonb_array_elements(public.lead_confirmation_queue()) q
  join public.cases c on c.id = (q ->> 'id')::uuid where c.is_demo), 0,
  'คิวยืนยันของหัวหน้า (TF-58) ไม่มีเคสตัวอย่าง');
select is((select count(*)::int from public.pending_performance_reviews() r
  join public.cases c on c.id = r.case_id where c.is_demo), 0,
  'คิวตรวจผลงานติดด่าน (TF-57) ไม่มีเคสตัวอย่าง แม้ seed มีเคสตัวอย่างติดด่าน');

-- ---------- 6. ผลงานหน่วยยังนับเคสตัวอย่าง (มีป้าย "ข้อมูลตัวอย่าง") ----------
select ok((select sum(helped) from public.unit_monthly_stats where unit_id = 'd5630000-0000-4000-8000-000000000001') > 0,
  'dashboard ผลงานหน่วยโชว์ยังมีตัวเลขจากเคสตัวอย่าง');
reset role;

select * from finish();
rollback;
