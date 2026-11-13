-- ============================================================================
-- TF-34: แจ้งเตือน LINE — คิวเดิมของ TF-43/TF-20 + เคสแดง + กันซ้ำ + โควตา
-- รัน: npx supabase test db
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(33);

-- ผู้ใช้: reporter + กู้ภัย r1..r8 + กู้ภัยเพิ่ม 11 คน (ทดสอบเพดาน 10 คน)
create function pg_temp.line_id(n int) returns text language sql as
  $$ select 'U' || lpad(to_hex(n), 32, '0') $$;
insert into auth.users(id)
  select ('a3400000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid from generate_series(1, 30) g;
insert into public.users(id, auth_user_id, display_name, role, status, line_user_id)
  select ('b3400000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
         ('a3400000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
         'tf34-' || g,
         (case when g = 1 then 'USER' else 'RESCUER' end)::public.user_role,
         (case when g = 5 then 'SUSPENDED' else 'ACTIVE' end)::public.user_status,
         pg_temp.line_id(g)
  from generate_series(1, 30) g;

-- หน่วย: U1 สมุทรสงคราม (เรือ), U2 คนละจังหวัด, U3 อำเภอไม่ตรง, U4 สมุทรสงคราม ไม่ระบุอำเภอ
insert into public.units(id, name, province, district, created_at) values
  ('c3400000-0000-0000-0000-000000000001', 'TF34 U1', 'สมุทรสงคราม', null, now() - interval '3 days'),
  ('c3400000-0000-0000-0000-000000000002', 'TF34 U2', 'ตราด', null, now() - interval '2 days'),
  ('c3400000-0000-0000-0000-000000000003', 'TF34 U3', 'สมุทรสงคราม', 'อัมพวา', now() - interval '2 days'),
  ('c3400000-0000-0000-0000-000000000004', 'TF34 U4', 'สมุทรสงคราม', null, now() - interval '1 day');
insert into public.unit_capabilities(unit_id, capability) values ('c3400000-0000-0000-0000-000000000001', 'BOAT');

-- r2 ออนไลน์ / r3 OFFLINE / r4 ไม่อยู่เวร / r5 บัญชีถูกระงับ / r6 สิทธิ์หมดอายุ / r7 คนละจังหวัด / r8 อำเภอไม่ตรง / r9 U4
insert into public.unit_members(id, unit_id, user_id, role_in_unit, status, is_on_duty, duty_status, expires_at) values
  ('e3400000-0000-0000-0000-000000000002', 'c3400000-0000-0000-0000-000000000001', 'b3400000-0000-0000-0000-000000000002', 'MEMBER', 'APPROVED', true, 'AVAILABLE', null),
  ('e3400000-0000-0000-0000-000000000003', 'c3400000-0000-0000-0000-000000000001', 'b3400000-0000-0000-0000-000000000003', 'MEMBER', 'APPROVED', true, 'OFFLINE', null),
  ('e3400000-0000-0000-0000-000000000004', 'c3400000-0000-0000-0000-000000000001', 'b3400000-0000-0000-0000-000000000004', 'MEMBER', 'APPROVED', false, 'AVAILABLE', null),
  ('e3400000-0000-0000-0000-000000000005', 'c3400000-0000-0000-0000-000000000001', 'b3400000-0000-0000-0000-000000000005', 'MEMBER', 'APPROVED', true, 'AVAILABLE', null),
  ('e3400000-0000-0000-0000-000000000006', 'c3400000-0000-0000-0000-000000000001', 'b3400000-0000-0000-0000-000000000006', 'MEMBER', 'APPROVED', true, 'AVAILABLE', now() - interval '1 day'),
  ('e3400000-0000-0000-0000-000000000007', 'c3400000-0000-0000-0000-000000000002', 'b3400000-0000-0000-0000-000000000007', 'MEMBER', 'APPROVED', true, 'AVAILABLE', null),
  ('e3400000-0000-0000-0000-000000000008', 'c3400000-0000-0000-0000-000000000003', 'b3400000-0000-0000-0000-000000000008', 'MEMBER', 'APPROVED', true, 'AVAILABLE', null),
  ('e3400000-0000-0000-0000-000000000009', 'c3400000-0000-0000-0000-000000000004', 'b3400000-0000-0000-0000-000000000009', 'MEMBER', 'APPROVED', true, 'EN_ROUTE', null);

create function pg_temp.new_case(code text, urgency text, reporter uuid default null) returns uuid
language sql as $$
  insert into public.cases(case_code, urgency, status, lat, lng, landmark, province, district, incident_type, reporter_user_id)
  values (code, urgency::public.urgency_level, 'NEW', 13.41, 100.0, 'หน้าวัด', 'สมุทรสงคราม', 'เมืองสมุทรสงคราม', 'FLOOD', reporter)
  returning id
$$;

-- ---------- สถานะเคส (trigger ของ TF-43 เปิดแล้ว) + กันซ้ำ 10 นาที ----------
select pg_temp.new_case('TF34-S', 'YELLOW', 'b3400000-0000-0000-0000-000000000001');
update public.cases set status = 'ACCEPTED' where case_code = 'TF34-S';
select is((select count(*)::int from public.case_line_notifications n join public.cases c on c.id = n.case_id
  where c.case_code = 'TF34-S' and n.kind = 'CASE_STATUS' and n.to_status = 'ACCEPTED'), 1,
  'เปลี่ยนสถานะแล้วเข้าคิวแจ้งผู้แจ้ง (trigger ของ TF-43 เปิดแล้ว)');
-- TF-26: ถอยกลับ NEW ได้เฉพาะช่องทางปล่อยเคส (release_case ตั้งค่านี้)
set local app.case_release = 'on';
update public.cases set status = 'NEW' where case_code = 'TF34-S';
update public.cases set status = 'ACCEPTED' where case_code = 'TF34-S';
select is((select count(*)::int from public.case_line_notifications n join public.cases c on c.id = n.case_id
  where c.case_code = 'TF34-S' and n.to_status = 'ACCEPTED'), 1,
  'เรื่องเดิม (รับเคส) ถึงคนเดิมภายใน 10 นาที ไม่เข้าคิวซ้ำ');
update public.case_line_notifications set created_at = now() - interval '11 minutes'
  where case_id = (select id from public.cases where case_code = 'TF34-S');
update public.cases set status = 'NEW' where case_code = 'TF34-S';
update public.cases set status = 'ACCEPTED' where case_code = 'TF34-S';
select is((select count(*)::int from public.case_line_notifications n join public.cases c on c.id = n.case_id
  where c.case_code = 'TF34-S' and n.to_status = 'ACCEPTED'), 2,
  'พ้น 10 นาทีแล้วเรื่องเดิมเข้าคิวได้อีก');

-- ---------- เคสแดงใหม่ → คิวกระจาย ----------
select pg_temp.new_case('TF34-R1', 'RED');
select pg_temp.new_case('TF34-Y1', 'YELLOW');
select ok(exists (select 1 from public.line_red_case_queue q join public.cases c on c.id = q.case_id where c.case_code = 'TF34-R1'),
  'เคสแดงใหม่เข้าคิวกระจาย');
select ok(not exists (select 1 from public.line_red_case_queue q join public.cases c on c.id = q.case_id where c.case_code = 'TF34-Y1'),
  'เคสเหลืองไม่เข้าคิวเคสแดง');
update public.cases set urgency = 'RED' where case_code = 'TF34-Y1';
select ok(exists (select 1 from public.line_red_case_queue q join public.cases c on c.id = q.case_id where c.case_code = 'TF34-Y1'),
  'ถูกปรับเป็นแดงตอนยัง NEW ก็เข้าคิว');

-- คิวพลาดแล้ว SOS ต้องยังสำเร็จ
alter table public.line_red_case_queue add constraint tf34_block_queue check (false) not valid;
select lives_ok($$select pg_temp.new_case('TF34-R-BLOCKED', 'RED')$$, 'เขียนคิวเคสแดงพลาด การสร้างเคสยังสำเร็จ');
alter table public.line_red_case_queue drop constraint tf34_block_queue;
select ok(exists (select 1 from public.cases where case_code = 'TF34-R-BLOCKED'), 'เคสถูกบันทึกจริง');

-- ---------- ผู้รับที่เป็นไปได้ (TODO TF-28: รัศมี 5 กม.) ----------
create temporary table cand as
  select * from public.list_red_alert_candidates((select id from public.cases where case_code = 'TF34-R1'));
select is((select string_agg(right(user_id::text, 2), ',' order by user_id) from cand), '02,09',
  'เฉพาะกู้ภัยออนไลน์ บัญชีปกติ สิทธิ์ไม่หมดอายุ จังหวัดตรง และอำเภอตรง (ถ้าหน่วยระบุ)');
select is((select capabilities from cand where right(user_id::text, 2) = '02'), array['BOAT'],
  'ส่งความสามารถของหน่วยให้ worker คัดด้วย canUnitHandle()');
select is((select capabilities from cand where right(user_id::text, 2) = '09'), '{}'::text[],
  'หน่วยที่ยังไม่ตั้งความสามารถได้ array ว่าง');

-- ---------- เพดาน 10 คนต่อเคส ----------
select is(
  public.enqueue_red_alerts((select id from public.cases where case_code = 'TF34-R1'),
    array(select ('b3400000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid from generate_series(10, 21) g)),
  10, 'เคสแดงหนึ่งเคสแจ้งได้ไม่เกิน 10 คน');
select ok((select processed_at is not null from public.line_red_case_queue q join public.cases c on c.id = q.case_id
  where c.case_code = 'TF34-R1'), 'กระจายแล้วปิดคิวกระจาย');
delete from public.case_line_notifications where kind = 'RED_ALERT';

-- ---------- digest: หลายเคสของคนเดียวรวมเป็น 1 ข้อความ, ไม่เกิน 1 ข้อความต่อ 5 นาที ----------
select pg_temp.new_case('TF34-D1', 'RED');
select pg_temp.new_case('TF34-D2', 'RED');
select pg_temp.new_case('TF34-D3', 'RED');
select public.enqueue_red_alerts(c.id, array['b3400000-0000-0000-0000-000000000002'::uuid])
  from public.cases c where c.case_code in ('TF34-D1', 'TF34-D2', 'TF34-D3');
create temporary table digest1 as select * from public.claim_red_alert_digests();
select is((select count(*)::int from digest1), 1, '3 เคสของคนเดียวได้ 1 ข้อความ');
select is((select case_count from digest1), 3, 'ข้อความบอกจำนวนเคส 3 เคส');
select is((select line_user_id from digest1), pg_temp.line_id(2), 'ส่งถึง LINE ID ของกู้ภัยคนนั้น');
select ok(not exists (select 1 from public.claim_case_line_notifications() where kind = 'RED_ALERT'),
  'คิวเคสปกติไม่หยิบงานเคสแดง (ส่งผ่าน digest เท่านั้น)');
select public.finish_red_alert_digest(digest_id, lease_id, 'SENT') from digest1;
select is((select count(*)::int from public.case_line_notifications where digest_id = (select digest_id from digest1) and state = 'SENT'),
  3, 'ส่งสำเร็จแล้วปิดทั้ง 3 งานพร้อมกัน');

select pg_temp.new_case('TF34-D4', 'RED');
select public.enqueue_red_alerts(c.id, array['b3400000-0000-0000-0000-000000000002'::uuid])
  from public.cases c where c.case_code = 'TF34-D4';
select is((select count(*)::int from public.claim_red_alert_digests()), 0,
  'ภายใน 5 นาทีหลังข้อความก่อน ยังไม่ส่งข้อความเคสแดงใหม่');
update public.case_line_notifications set accepted_at = now() - interval '6 minutes'
  where digest_id = (select digest_id from digest1);
select is((select case_count from public.claim_red_alert_digests()), 1,
  'พ้น 5 นาทีแล้วส่งเคสที่รอไว้');

-- ---------- ผลการส่ง: RELEASE / SKIPPED และลำดับต่อ (เคส, ผู้รับ) ----------
insert into public.case_line_notifications(kind, case_id, user_id, to_status)
  select 'CASE_STATUS', c.id, u, 'EN_ROUTE' from public.cases c,
    unnest(array['b3400000-0000-0000-0000-000000000002'::uuid, 'b3400000-0000-0000-0000-000000000009'::uuid]) u
  where c.case_code = 'TF34-D1';
create temporary table claimed as select * from public.claim_case_line_notifications() where case_code = 'TF34-D1';
select is((select count(*)::int from claimed), 2, 'ผู้รับคนละคนของเคสเดียวกันไม่ต้องรอคิวกัน');
select public.finish_case_line_notification(id, lease_id, 'RELEASE') from claimed where line_user_id = pg_temp.line_id(2);
select is((select state || ':' || attempts from public.case_line_notifications
  where id = (select id from claimed where line_user_id = pg_temp.line_id(2))), 'PENDING:0',
  'RELEASE คืนคิวโดยไม่นับเป็นความพยายาม (ใช้ตอนหยุดเพราะโควตาหมด)');
select public.finish_case_line_notification(id, lease_id, 'SKIPPED') from claimed where line_user_id = pg_temp.line_id(9);
select is((select state from public.case_line_notifications
  where id = (select id from claimed where line_user_id = pg_temp.line_id(9))), 'SKIPPED',
  'dev/uat ไม่ส่งจริง ปิดงานเป็น SKIPPED ไม่ retry');

-- ---------- โควตา LINE รายเดือนหมด ----------
select ok(not public.is_line_delivery_paused(), 'ปกติยังไม่หยุดส่ง');
select ok(public.pause_line_delivery('line_monthly_quota') > now(), 'หยุดส่งถึงต้นเดือนหน้า');
select ok(public.is_line_delivery_paused(), 'worker เห็นว่าหยุดส่งอยู่');
select public.pause_line_delivery('line_monthly_quota');
select is((select count(*)::int from public.audit_logs where action = 'LINE_DELIVERY_PAUSED'), 1,
  'บันทึกให้แอดมินเห็นครั้งเดียว ไม่ซ้ำทุกรอบ');

-- ---------- จุดเชื่อม TF-58 / คิวสมาชิกกันซ้ำ ----------
select ok(public.enqueue_close_confirmation((select id from public.cases where case_code = 'TF34-S')),
  'ขอให้ผู้แจ้งยืนยันปิดเคส: เข้าคิว CLOSE_CONFIRM');
select ok(not public.enqueue_close_confirmation((select id from public.cases where case_code = 'TF34-R1')),
  'เคสที่ไม่มีบัญชีผู้แจ้งไม่เข้าคิว');
insert into public.member_line_notifications(unit_member_id, unit_id, user_id, to_status)
  values ('e3400000-0000-0000-0000-000000000002', 'c3400000-0000-0000-0000-000000000001', 'b3400000-0000-0000-0000-000000000002', 'APPROVED'),
         ('e3400000-0000-0000-0000-000000000002', 'c3400000-0000-0000-0000-000000000001', 'b3400000-0000-0000-0000-000000000002', 'APPROVED');
select is((select count(*)::int from public.member_line_notifications where unit_member_id = 'e3400000-0000-0000-0000-000000000002'),
  1, 'แจ้งผลอนุมัติเรื่องเดิมภายใน 10 นาทีไม่ซ้ำ');

-- ---------- สิทธิ์ และตัวเรียก worker ----------
select ok(
  not has_function_privilege('authenticated', 'public.claim_red_alert_digests()', 'execute')
  and not has_function_privilege('authenticated', 'public.pause_line_delivery(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.list_red_alert_candidates(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.enqueue_close_confirmation(uuid)', 'execute'),
  'RPC ของคิวเรียกได้เฉพาะ worker (service_role)');
select lives_ok($$select public.run_line_worker()$$, 'ยังไม่ตั้ง Vault: ตัวเรียก worker ไม่ทำอะไรและไม่ error');
select is((select count(*)::int from cron.job where jobname in ('tf34-line-worker', 'tf34-line-queue-cleanup')), 2,
  'pg_cron มีงานเรียก worker ทุกนาที และงานล้างคิวรายวัน');

select * from finish();
rollback;
