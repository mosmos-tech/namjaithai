-- ============================================================================
-- TF-25: รับเคสและปล่อยเคส — คนเดียวได้, เพดาน 2 เคส, แอดมินรับไม่ได้, คนนอกหน่วยปล่อยไม่ได้,
-- สิทธิ์เห็นเบอร์/ข้อมูลสุขภาพหลังรับ, LINE ผู้แจ้ง, แจ้งเคสแดงอีกรอบหลังปล่อย
-- กดพร้อมกันจริง 2 session ทดสอบใน e2e/claim-case.spec.ts (pgTAP อยู่ใน transaction เดียว)
-- รัน: npx supabase test db
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(35);

-- ผู้ใช้: 1 A กู้ภัย U1 / 2 B กู้ภัย U2 (จังหวัดเดียวกัน) / 3 L หัวหน้า U1 / 4 M สมาชิก U1
--        5 O กู้ภัย U3 (คนละจังหวัด) / 6 แอดมิน / 7 ผู้แจ้ง (LINE) / 8 N ไม่มีหน่วย
insert into auth.users(id)
  select ('a2500000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid from generate_series(1, 8) g;
insert into public.users(id, auth_user_id, display_name, role, status, line_user_id)
  select ('b2500000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
         ('a2500000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
         'tf25-' || g,
         (case g when 3 then 'UNIT_LEAD' when 6 then 'ADMIN' when 7 then 'USER' else 'RESCUER' end)::public.user_role,
         'ACTIVE',
         'U' || lpad(to_hex(2500 + g), 32, '0')
  from generate_series(1, 8) g;

insert into public.units(id, name, province, created_at) values
  ('c2500000-0000-0000-0000-000000000001', 'TF25 หน่วยหนึ่ง', 'ตราด', now() - interval '3 days'),
  ('c2500000-0000-0000-0000-000000000002', 'TF25 หน่วยสอง', 'ตราด', now() - interval '2 days'),
  ('c2500000-0000-0000-0000-000000000003', 'TF25 หน่วยสาม', 'น่าน', now() - interval '1 day');
insert into public.unit_members(unit_id, user_id, role_in_unit, status, is_on_duty, duty_status) values
  ('c2500000-0000-0000-0000-000000000001', 'b2500000-0000-0000-0000-000000000001', 'MEMBER', 'APPROVED', true, 'AVAILABLE'),
  ('c2500000-0000-0000-0000-000000000002', 'b2500000-0000-0000-0000-000000000002', 'MEMBER', 'APPROVED', true, 'AVAILABLE'),
  ('c2500000-0000-0000-0000-000000000001', 'b2500000-0000-0000-0000-000000000003', 'LEAD', 'APPROVED', true, 'AVAILABLE'),
  ('c2500000-0000-0000-0000-000000000001', 'b2500000-0000-0000-0000-000000000004', 'MEMBER', 'APPROVED', true, 'AVAILABLE'),
  ('c2500000-0000-0000-0000-000000000003', 'b2500000-0000-0000-0000-000000000005', 'MEMBER', 'APPROVED', true, 'AVAILABLE');

create function pg_temp.new_case(code text, urgency text, province text default 'ตราด') returns uuid
language sql as $$
  insert into public.cases(case_code, urgency, status, lat, lng, landmark, province, incident_type, reporter_user_id)
  values (code, urgency::public.urgency_level, 'NEW', 12.24, 102.51, 'หน้าวัด', province, 'FLOOD',
          'b2500000-0000-0000-0000-000000000007')
  returning id
$$;
create function pg_temp.id(code text) returns uuid language sql as
  $$ select id from public.cases where case_code = code $$;
create function pg_temp.ver(code text) returns integer language sql as
  $$ select version from public.cases where case_code = code $$;
-- สลับเป็นผู้ใช้คนที่ n (ผ่าน RLS เหมือนเรียกจากเว็บ)
create function pg_temp.as_user(n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', 'a2500000-0000-0000-0000-' || lpad(n::text, 12, '0'), 'role', 'authenticated')::text,
    true);
$$;

select pg_temp.new_case('TF25-C1', 'RED');
select pg_temp.new_case('TF25-C2', 'YELLOW');
select pg_temp.new_case('TF25-C3', 'YELLOW');
select pg_temp.new_case('TF25-C4', 'YELLOW');
insert into public.case_contacts(case_id, name, phone, phone_last4)
  values (pg_temp.id('TF25-C1'), 'ผู้แจ้ง TF25', '0812502500', '2500');
insert into public.case_sensitive_details(case_id, details)
  values (pg_temp.id('TF25-C1'), '{"hasInjured": true}');

grant execute on function pg_temp.id(text), pg_temp.ver(text), pg_temp.as_user(int) to authenticated;

-- ---------- 1. รับเคส: คนแรกได้ คนที่สอง (เห็น version เดิม) ได้แค่ชื่อหน่วย ----------
create temp table v1 as select pg_temp.ver('TF25-C1') as v;
grant select on v1 to authenticated;
set local role authenticated;
select pg_temp.as_user(1);
select is(public.accept_case(pg_temp.id('TF25-C1'), (select v from v1)) ->> 'status', 'ACCEPTED',
  'A กดรับเคสที่ยังเป็น NEW ได้');
select pg_temp.as_user(2);
select is(public.accept_case(pg_temp.id('TF25-C1'), (select v from v1)),
  '{"status": "TAKEN", "unitName": "TF25 หน่วยหนึ่ง"}'::jsonb,
  'B กดช้า (version เดิม) ได้แค่ชื่อหน่วยที่รับไปแล้ว ไม่มีชื่อคน');
reset role;

select ok((select status = 'ACCEPTED' and assigned_rescuer_id = 'b2500000-0000-0000-0000-000000000001'
    and assigned_unit_id = 'c2500000-0000-0000-0000-000000000001' and accepted_at is not null
    and version = (select v from v1) + 1
  from public.cases where case_code = 'TF25-C1'), 'เคสบันทึกคนรับ หน่วย เวลา และ version ใหม่');
select is((select count(*)::int from public.case_events where case_id = pg_temp.id('TF25-C1')
  and event_type = 'ACCEPTED' and actor_user_id = 'b2500000-0000-0000-0000-000000000001'), 1,
  'case_events บันทึกการรับเคส');
select is((select count(*)::int from public.audit_logs where case_id = pg_temp.id('TF25-C1') and action = 'CASE_ACCEPTED'), 1,
  'audit_logs บันทึกการรับเคส');
select is((select count(*)::int from public.case_line_notifications where case_id = pg_temp.id('TF25-C1')
  and kind = 'CASE_STATUS' and to_status = 'ACCEPTED' and user_id = 'b2500000-0000-0000-0000-000000000007'), 1,
  'trigger LINE ของ TF-34 เข้าคิว "ทีมรับเคสแล้ว" ให้ผู้แจ้ง');

-- ---------- 2. หลังรับ: คนที่รับเห็นเบอร์และข้อมูลสุขภาพทันที คนอื่นไม่เห็น ----------
set local role authenticated;
select pg_temp.as_user(1);
select is((select count(*)::int from public.case_sensitive_details where case_id = pg_temp.id('TF25-C1')), 1,
  'A อ่านข้อมูลสุขภาพของเคสที่เพิ่งรับได้ทันที');
select is(public.reveal_case_contact(pg_temp.id('TF25-C1')) ->> 'phone', '0812502500',
  'A เปิดเบอร์ผู้แจ้งได้ทันที');
select is(public.case_detail_permissions(pg_temp.id('TF25-C1')) ->> 'release', 'true', 'A เห็นปุ่มปล่อยเคส');
select pg_temp.as_user(2);
select is((select count(*)::int from public.case_sensitive_details where case_id = pg_temp.id('TF25-C1')), 0,
  'B (หน่วยอื่น) ไม่เห็นข้อมูลสุขภาพ');
select throws_ok($$select public.reveal_case_contact(pg_temp.id('TF25-C1'))$$, '42501', null, 'B เปิดเบอร์ไม่ได้');

-- ---------- 3. เพดาน 2 เคส / แอดมิน / คนมองไม่เห็นเคส / version เปลี่ยน ----------
select pg_temp.as_user(1);
select is(public.accept_case(pg_temp.id('TF25-C2'), pg_temp.ver('TF25-C2')) ->> 'status', 'ACCEPTED', 'A รับเคสที่ 2 ได้');
select is(public.accept_case(pg_temp.id('TF25-C3'), pg_temp.ver('TF25-C3')),
  '{"status": "LIMIT", "max": 2}'::jsonb, 'A ถือ 2 เคสแล้ว รับเคสที่ 3 ไม่ได้');
select is(public.case_detail_permissions(pg_temp.id('TF25-C3')) ->> 'accept', 'true',
  'ปุ่มรับยังขึ้น (เพดานบอกตอนกด พร้อมข้อความ)');
select pg_temp.as_user(6);
select throws_ok($$select public.accept_case(pg_temp.id('TF25-C3'), pg_temp.ver('TF25-C3'))$$, '42501', null,
  'แอดมินกดรับเคสไม่ได้ (ใช้มอบหมายแทน)');
select is(public.case_detail_permissions(pg_temp.id('TF25-C3')) ->> 'accept', 'false', 'แอดมินไม่มีปุ่มรับเคส');
select pg_temp.as_user(5);
select throws_ok($$select public.accept_case(pg_temp.id('TF25-C3'), 1)$$, '42501', null,
  'กู้ภัยคนละจังหวัด (มองไม่เห็นเคส) รู้ id ก็กดรับไม่ได้');
select pg_temp.as_user(8);
select throws_ok($$select public.accept_case(pg_temp.id('TF25-C3'), 1)$$, '42501', null,
  'คนที่ไม่มีหน่วยกดรับไม่ได้');
reset role;
update public.cases set version = version + 1 where case_code = 'TF25-C3';
set local role authenticated;
select pg_temp.as_user(2);
select is(public.accept_case(pg_temp.id('TF25-C3'), pg_temp.ver('TF25-C3') - 1) ->> 'status', 'STALE',
  'เคสยังว่างแต่ข้อมูลเพิ่งเปลี่ยน ได้ STALE ให้โหลดใหม่');

-- ---------- 4. ปล่อยเคส: คนนอกหน่วย / สมาชิกที่ไม่ได้รับ / ไม่มีเหตุผล ----------
select pg_temp.as_user(5);
select throws_ok($$select public.release_case(pg_temp.id('TF25-C1'), pg_temp.ver('TF25-C1'), 'ไปไม่ได้')$$,
  '42501', null, 'คนนอกพื้นที่ปล่อยเคสไม่ได้');
select pg_temp.as_user(2);
select throws_ok($$select public.release_case(pg_temp.id('TF25-C1'), pg_temp.ver('TF25-C1'), 'ไปไม่ได้')$$,
  '42501', null, 'กู้ภัยหน่วยอื่นปล่อยเคสไม่ได้');
select pg_temp.as_user(4);
select throws_ok($$select public.release_case(pg_temp.id('TF25-C1'), pg_temp.ver('TF25-C1'), 'ไปไม่ได้')$$,
  '42501', null, 'สมาชิกหน่วยเดียวกันที่ไม่ได้รับเคสปล่อยไม่ได้');
select pg_temp.as_user(1);
select throws_ok($$select public.release_case(pg_temp.id('TF25-C1'), pg_temp.ver('TF25-C1'), '  ')$$,
  '22023', null, 'ไม่ใส่เหตุผลปล่อยไม่ได้');

-- รอบแจ้งเคสแดงครั้งแรกเพิ่งส่ง A และ L (ภายใน 10 นาที)
reset role;
update public.line_red_case_queue set processed_at = now() where case_id = pg_temp.id('TF25-C1');
insert into public.case_line_notifications(kind, case_id, user_id) values
  ('RED_ALERT', pg_temp.id('TF25-C1'), 'b2500000-0000-0000-0000-000000000001'),
  ('RED_ALERT', pg_temp.id('TF25-C1'), 'b2500000-0000-0000-0000-000000000003');

set local role authenticated;
select pg_temp.as_user(1);
select is(public.release_case(pg_temp.id('TF25-C1'), pg_temp.ver('TF25-C1'), '  เรือเสีย ไปไม่ได้  ') ->> 'status',
  'RELEASED', 'A ปล่อยเคสพร้อมเหตุผลได้');
select is((select count(*)::int from public.case_sensitive_details where case_id = pg_temp.id('TF25-C1')), 0,
  'ปล่อยแล้ว A ไม่เห็นข้อมูลสุขภาพอีก');
reset role;

select ok((select status = 'NEW' and assigned_rescuer_id is null and assigned_unit_id is null and accepted_at is null
  from public.cases where case_code = 'TF25-C1'), 'สถานะกลับเป็น NEW และล้างหน่วย/คนที่รับ');
select is((select note from public.case_events where case_id = pg_temp.id('TF25-C1') and event_type = 'RELEASED'),
  'เรือเสีย ไปไม่ได้', 'case_events บันทึกการปล่อยพร้อมเหตุผล');
select is((select count(*)::int from public.case_line_notifications where case_id = pg_temp.id('TF25-C1')
  and kind = 'CASE_STATUS' and to_status = 'NEW'), 1, 'ผู้แจ้งได้แจ้งเตือน LINE ว่ากำลังหาทีมใหม่');

-- ---------- 5. เคสแดงที่ถูกปล่อย: แจ้งเตือนอีกรอบ ไม่ถึงคนที่ปล่อย ไม่โดนตัวกันซ้ำ 10 นาที ----------
select ok((select processed_at is null and alert_round = 1 and exclude_user_id = 'b2500000-0000-0000-0000-000000000001'
  from public.line_red_case_queue where case_id = pg_temp.id('TF25-C1')), 'เคสแดงกลับเข้าคิวแจ้งเตือนรอบใหม่');
select ok(not exists (select 1 from public.list_red_alert_candidates(pg_temp.id('TF25-C1'))
  where user_id = 'b2500000-0000-0000-0000-000000000001'), 'ไม่แจ้งคนที่เพิ่งปล่อยเคส');
select ok(exists (select 1 from public.list_red_alert_candidates(pg_temp.id('TF25-C1'))
  where user_id = 'b2500000-0000-0000-0000-000000000003'), 'คนอื่นในพื้นที่ยังได้รับแจ้ง');
select is(public.enqueue_red_alerts(pg_temp.id('TF25-C1'),
  array['b2500000-0000-0000-0000-000000000001', 'b2500000-0000-0000-0000-000000000003']::uuid[]), 1,
  'รอบใหม่เข้าคิวได้แม้เพิ่งแจ้งไปไม่ถึง 10 นาที (และกันคนที่ปล่อยอีกชั้น)');
insert into public.case_line_notifications(kind, case_id, user_id, alert_round)
  values ('RED_ALERT', pg_temp.id('TF25-C1'), 'b2500000-0000-0000-0000-000000000003', 1);
select is((select count(*)::int from public.case_line_notifications where case_id = pg_temp.id('TF25-C1')
  and kind = 'RED_ALERT' and user_id = 'b2500000-0000-0000-0000-000000000003'), 2,
  'ตัวกันซ้ำ 10 นาทียังทำงานภายในรอบเดียวกัน');

-- ---------- 6. หัวหน้าหน่วยปล่อยเคสของลูกทีมได้ ----------
set local role authenticated;
select pg_temp.as_user(3);
select is(public.release_case(pg_temp.id('TF25-C2'), pg_temp.ver('TF25-C2'), 'ย้ายไปช่วยจุดอื่น') ->> 'status',
  'RELEASED', 'หัวหน้าหน่วยที่รับเคสปล่อยเคสของลูกทีมได้');
select pg_temp.as_user(1);
select is(public.release_case(pg_temp.id('TF25-C2'), pg_temp.ver('TF25-C2'), 'ปล่อยซ้ำ') ->> 'status', 'STALE',
  'เคสที่ปล่อยไปแล้วปล่อยซ้ำไม่ได้');
reset role;

select * from finish();
rollback;
