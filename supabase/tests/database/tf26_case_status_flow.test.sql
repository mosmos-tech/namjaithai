-- ============================================================================
-- TF-26: กติกาเปลี่ยนสถานะเคส (trigger + ทุกคู่สถานะ) และ advance_case_status
-- ข้ามขั้น/ถอยหลังไม่ได้ · กู้ภัย/หัวหน้าปิดเคสเองไม่ได้ทั้งผ่าน RPC และ UPDATE ตรง
-- ผู้แจ้งกดปลอดภัยแล้วยังยกเลิกได้ · AWAITING_CONFIRMATION ไม่นับเพดาน 2 เคส
-- กดพร้อมกันจริง 2 session ทดสอบใน e2e/my-tasks.spec.ts
-- รัน: npx supabase test db
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(45);

-- ---------- 1. ทุกคู่สถานะ × ทุกช่องทาง ตรงกับตารางใน src/lib/domain/__tests__/case-status.test.ts ----------
create temp table modes(mode text, rel boolean, rep boolean, lead boolean);
insert into modes values
  ('normal', false, false, false), ('release', true, false, false),
  ('reporterCancel', false, true, false), ('leadClose', false, false, true);
create temp table allowed(mode text, f text, t text);
insert into allowed
  select m.mode, s.f, s.t from modes m cross join (values
    ('NEW', 'ACCEPTED'), ('ACCEPTED', 'EN_ROUTE'), ('EN_ROUTE', 'ON_SITE'),
    ('ON_SITE', 'AWAITING_CONFIRMATION')) s(f, t);
insert into allowed values ('release', 'ACCEPTED', 'NEW'), ('release', 'EN_ROUTE', 'NEW');
insert into allowed
  select 'reporterCancel', f, 'CANCELLED'
  from unnest(array['NEW', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE', 'AWAITING_CONFIRMATION']) f;
insert into allowed
  select 'leadClose', f, t
  from unnest(array['NEW', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE', 'AWAITING_CONFIRMATION']) f,
       unnest(array['CANCELLED', 'DUPLICATE', 'UNREACHABLE']) t;
insert into allowed values ('leadClose', 'AWAITING_CONFIRMATION', 'RESOLVED');

create function pg_temp.allowed_by_db(p_mode text) returns table(f text, t text) language sql as $$
  select a::text, b::text
  from modes m, unnest(enum_range(null::public.case_status)) a, unnest(enum_range(null::public.case_status)) b
  where m.mode = p_mode and a <> b
    and public.case_status_transition_allowed(a, b, m.rel, m.rep, m.lead)
$$;
select set_eq($$select * from pg_temp.allowed_by_db('normal')$$,
  $$select f, t from allowed where mode = 'normal'$$,
  'ช่องทางปกติ: เดินหน้าทีละขั้นเท่านั้น ครบทุกคู่ 9 × 9 สถานะ');
select set_eq($$select * from pg_temp.allowed_by_db('release')$$,
  $$select f, t from allowed where mode = 'release'$$,
  'release_case: ถอยกลับ NEW ได้จาก ACCEPTED / EN_ROUTE เท่านั้น');
select set_eq($$select * from pg_temp.allowed_by_db('reporterCancel')$$,
  $$select f, t from allowed where mode = 'reporterCancel'$$,
  'ผู้แจ้งยกเลิก: ปิดเป็น CANCELLED ได้จากทุกสถานะที่ยังเปิด');
select set_eq($$select * from pg_temp.allowed_by_db('leadClose')$$,
  $$select f, t from allowed where mode = 'leadClose'$$,
  'หัวหน้า/ระบบ: ปิดเคสได้ และ RESOLVED ได้เฉพาะจาก AWAITING_CONFIRMATION');

-- ผู้ใช้: 1 A กู้ภัย U1 (คนรับเคส) / 2 L หัวหน้า U1 / 3 M สมาชิก U1 / 4 B กู้ภัย U2 จังหวัดเดียวกัน
--        5 แอดมิน / 6 ผู้แจ้ง (LINE)
insert into auth.users(id)
  select ('a2600000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid from generate_series(1, 6) g;
insert into public.users(id, auth_user_id, display_name, role, status, line_user_id)
  select ('b2600000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
         ('a2600000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
         'tf26-' || g,
         (case g when 2 then 'UNIT_LEAD' when 5 then 'ADMIN' when 6 then 'USER' else 'RESCUER' end)::public.user_role,
         'ACTIVE',
         'U' || lpad(to_hex(2600 + g), 32, '0')
  from generate_series(1, 6) g;
insert into public.units(id, name, province) values
  ('c2600000-0000-0000-0000-000000000001', 'TF26 หน่วยหนึ่ง', 'ตราด'),
  ('c2600000-0000-0000-0000-000000000002', 'TF26 หน่วยสอง', 'ตราด');
insert into public.unit_members(unit_id, user_id, role_in_unit, status, is_on_duty, duty_status) values
  ('c2600000-0000-0000-0000-000000000001', 'b2600000-0000-0000-0000-000000000001', 'MEMBER', 'APPROVED', true, 'AVAILABLE'),
  ('c2600000-0000-0000-0000-000000000001', 'b2600000-0000-0000-0000-000000000002', 'LEAD', 'APPROVED', true, 'AVAILABLE'),
  ('c2600000-0000-0000-0000-000000000001', 'b2600000-0000-0000-0000-000000000003', 'MEMBER', 'APPROVED', true, 'AVAILABLE'),
  ('c2600000-0000-0000-0000-000000000002', 'b2600000-0000-0000-0000-000000000004', 'MEMBER', 'APPROVED', true, 'AVAILABLE');

create function pg_temp.new_case(code text, status text default 'NEW') returns uuid
language sql as $$
  insert into public.cases(case_code, urgency, status, lat, lng, landmark, province, incident_type,
                           reporter_user_id, tracking_token)
  values (code, 'YELLOW', status::public.case_status, 12.24, 102.51, 'หน้าวัด', 'ตราด', 'FLOOD',
          'b2600000-0000-0000-0000-000000000006', md5(code))
  returning id
$$;
create function pg_temp.id(code text) returns uuid language sql as
  $$ select id from public.cases where case_code = code $$;
create function pg_temp.ver(code text) returns integer language sql as
  $$ select version from public.cases where case_code = code $$;
create function pg_temp.as_user(n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', 'a2600000-0000-0000-0000-' || lpad(n::text, 12, '0'), 'role', 'authenticated')::text,
    true);
$$;
grant execute on function pg_temp.id(text), pg_temp.ver(text), pg_temp.as_user(int) to authenticated;

-- ---------- 2. trigger: UPDATE ตรง (ไม่ผ่าน RPC) ก็ข้ามขั้น/ถอยหลัง/ปิดเคสไม่ได้ ----------
select pg_temp.new_case('TF26-T1');
select pg_temp.new_case('TF26-T2', 'ACCEPTED');
select pg_temp.new_case('TF26-T3', 'ON_SITE');
select throws_ok($$update public.cases set status = 'ON_SITE' where case_code = 'TF26-T1'$$,
  '23514', null, 'UPDATE ตรง NEW → ON_SITE (ข้ามขั้น) ไม่ได้');
select throws_ok($$update public.cases set status = 'EN_ROUTE' where case_code = 'TF26-T3'$$,
  '23514', null, 'UPDATE ตรง ON_SITE → EN_ROUTE (ถอยหลัง) ไม่ได้');
select throws_ok($$update public.cases set status = 'NEW' where case_code = 'TF26-T2'$$,
  '23514', null, 'UPDATE ตรง ACCEPTED → NEW ไม่ได้ถ้าไม่ใช่ release_case');
select throws_ok($$update public.cases set status = 'RESOLVED' where case_code = 'TF26-T3'$$,
  '23514', null, 'UPDATE ตรง ON_SITE → RESOLVED ไม่ได้ (ต้องรอผู้แจ้งยืนยัน)');
select throws_ok($$update public.cases set status = 'UNREACHABLE' where case_code = 'TF26-T2'$$,
  '23514', null, 'UPDATE ตรง ปิดเป็น UNREACHABLE ไม่ได้');
select throws_ok($$update public.cases set status = 'DUPLICATE' where case_code = 'TF26-T2'$$,
  '23514', null, 'UPDATE ตรง ปิดเป็น DUPLICATE ไม่ได้');
select throws_ok($$update public.cases set status = 'CANCELLED' where case_code = 'TF26-T2'$$,
  '23514', null, 'UPDATE ตรง ปิดเป็น CANCELLED ไม่ได้');
select lives_ok($$update public.cases set landmark = 'หน้าวัดใหม่' where case_code = 'TF26-T3'$$,
  'แก้คอลัมน์อื่นที่ไม่ใช่สถานะได้ตามปกติ');

-- ---------- 3. advance_case_status: คนรับเคสเลื่อนทีละขั้น ใช้ version กันกดซ้ำ ----------
select pg_temp.new_case('TF26-C1');
select pg_temp.new_case('TF26-C2');
select pg_temp.new_case('TF26-C3');
select pg_temp.new_case('TF26-C4');
create temp table v(code text primary key, v integer);
grant select, insert, update on v to authenticated;
insert into v select case_code, version from public.cases where case_code like 'TF26-C%';

set local role authenticated;
select pg_temp.as_user(1);
select is(public.accept_case(pg_temp.id('TF26-C1'), pg_temp.ver('TF26-C1')) ->> 'status', 'ACCEPTED',
  'A รับเคส C1');
update v set v = pg_temp.ver('TF26-C1') where code = 'TF26-C1';
select is(public.advance_case_status(pg_temp.id('TF26-C1'), (select v from v where code = 'TF26-C1'), 'EN_ROUTE')
  ->> 'status', 'UPDATED', 'A กด เริ่มเดินทาง: ACCEPTED → EN_ROUTE');
select is(public.advance_case_status(pg_temp.id('TF26-C1'), (select v from v where code = 'TF26-C1'), 'EN_ROUTE')
  ->> 'status', 'STALE', 'กดซ้ำด้วย version เดิม ได้ STALE ไม่เปลี่ยนซ้ำ');
update v set v = pg_temp.ver('TF26-C1') where code = 'TF26-C1';
select throws_ok($$select public.advance_case_status(pg_temp.id('TF26-C1'),
  (select v from v where code = 'TF26-C1'), 'AWAITING_CONFIRMATION', null, 'HELPED', 1)$$,
  '23514', null, 'ข้ามขั้น EN_ROUTE → AWAITING_CONFIRMATION ไม่ได้');

-- ปิดเคสผ่าน RPC ไม่ได้ทุกสถานะปิด (คนรับเคสเอง)
select throws_ok($$select public.advance_case_status(pg_temp.id('TF26-C1'), (select v from v where code = 'TF26-C1'), 'RESOLVED')$$,
  '22023', null, 'คนรับเคสปิดเป็น RESOLVED ผ่าน RPC ไม่ได้');
select throws_ok($$select public.advance_case_status(pg_temp.id('TF26-C1'), (select v from v where code = 'TF26-C1'), 'CANCELLED')$$,
  '22023', null, 'คนรับเคสปิดเป็น CANCELLED ผ่าน RPC ไม่ได้');
select throws_ok($$select public.advance_case_status(pg_temp.id('TF26-C1'), (select v from v where code = 'TF26-C1'), 'DUPLICATE')$$,
  '22023', null, 'คนรับเคสปิดเป็น DUPLICATE ผ่าน RPC ไม่ได้');
select throws_ok($$select public.advance_case_status(pg_temp.id('TF26-C1'), (select v from v where code = 'TF26-C1'), 'UNREACHABLE')$$,
  '22023', null, 'คนรับเคสปิดเป็น UNREACHABLE ผ่าน RPC ไม่ได้');

-- คนรับเคสก็ UPDATE ตรงไม่ได้ (ไม่มีสิทธิ์เขียนตาราง cases)
select throws_ok($$update public.cases set status = 'RESOLVED' where id = pg_temp.id('TF26-C1')$$,
  '42501', null, 'คนรับเคส UPDATE ตารางตรงเพื่อปิดเคสไม่ได้');

-- สิทธิ์: สมาชิกคนอื่นในหน่วย / คนนอกหน่วย / แอดมิน เลื่อนสถานะไม่ได้
select pg_temp.as_user(3);
select throws_ok($$select public.advance_case_status(pg_temp.id('TF26-C1'), (select v from v where code = 'TF26-C1'), 'ON_SITE')$$,
  '42501', null, 'สมาชิกหน่วยเดียวกันที่ไม่ได้รับเคส เลื่อนสถานะไม่ได้');
select pg_temp.as_user(4);
select throws_ok($$select public.advance_case_status(pg_temp.id('TF26-C1'), (select v from v where code = 'TF26-C1'), 'ON_SITE')$$,
  '42501', null, 'กู้ภัยหน่วยอื่น (เห็นเคสในจังหวัด) เลื่อนสถานะไม่ได้');
select pg_temp.as_user(5);
select throws_ok($$select public.advance_case_status(pg_temp.id('TF26-C1'), (select v from v where code = 'TF26-C1'), 'ON_SITE')$$,
  '42501', null, 'แอดมินเลื่อนสถานะเองไม่ได้ (มอบหมายแทน)');

-- หัวหน้าของหน่วยที่รับเคสเลื่อนแทนได้ แต่ปิดเคสไม่ได้
select pg_temp.as_user(2);
select is(public.advance_case_status(pg_temp.id('TF26-C1'), (select v from v where code = 'TF26-C1'), 'ON_SITE', 'ถึงหน้าบ้าน')
  ->> 'status', 'UPDATED', 'หัวหน้าหน่วยที่รับเคสกด ถึงที่เกิดเหตุ แทนได้');
update v set v = pg_temp.ver('TF26-C1') where code = 'TF26-C1';
select throws_ok($$select public.advance_case_status(pg_temp.id('TF26-C1'), (select v from v where code = 'TF26-C1'), 'RESOLVED')$$,
  '22023', null, 'หัวหน้าปิดเคสผ่าน RPC นี้ไม่ได้');

-- ช่วยเสร็จแล้ว: ต้องมีผลและจำนวนคน อื่นๆ ต้องมีโน้ต
select pg_temp.as_user(1);
select throws_ok($$select public.advance_case_status(pg_temp.id('TF26-C1'), (select v from v where code = 'TF26-C1'), 'AWAITING_CONFIRMATION')$$,
  '22023', null, 'ช่วยเสร็จแล้วโดยไม่ระบุผลและจำนวนคน ไม่ได้');
select throws_ok($$select public.advance_case_status(pg_temp.id('TF26-C1'), (select v from v where code = 'TF26-C1'),
  'AWAITING_CONFIRMATION', null, 'OTHER', 2)$$,
  '22023', null, 'เลือก อื่นๆ โดยไม่มีโน้ต ไม่ได้');
select is(public.advance_case_status(pg_temp.id('TF26-C1'), (select v from v where code = 'TF26-C1'),
  'AWAITING_CONFIRMATION', 'ส่งต่อ รพ.', 'HOSPITAL', 3) ->> 'status', 'UPDATED',
  'A กด ช่วยเสร็จแล้ว พร้อมผล พาไปโรงพยาบาล 3 คน');
select lives_ok($$select public.add_case_note(pg_temp.id('TF26-C1'), 'ผู้แจ้งปลอดภัยแล้ว')$$,
  'A ใส่โน้ตได้โดยไม่เปลี่ยนสถานะ');
select pg_temp.as_user(3);
select throws_ok($$select public.add_case_note(pg_temp.id('TF26-C1'), 'แอบเขียน')$$,
  '42501', null, 'สมาชิกที่ไม่ได้รับเคสใส่โน้ตไม่ได้');

-- AWAITING_CONFIRMATION ไม่นับเพดาน 2 เคส: รับได้อีก 2 เคส เคสที่ 3 ติดเพดาน
select pg_temp.as_user(1);
select is(public.accept_case(pg_temp.id('TF26-C2'), (select v from v where code = 'TF26-C2')) ->> 'status', 'ACCEPTED',
  'เคสที่รอผู้แจ้งยืนยันไม่นับเพดาน: รับเคสที่ 2 ได้');
select is(public.accept_case(pg_temp.id('TF26-C3'), (select v from v where code = 'TF26-C3')) ->> 'status', 'ACCEPTED',
  'รับเคสที่ 3 ได้ (ถือจริง 2 เคส)');
select is(public.accept_case(pg_temp.id('TF26-C4'), (select v from v where code = 'TF26-C4')) ->> 'status', 'LIMIT',
  'เคสที่ 4 ติดเพดาน 2 เคสที่ยังต้องลงมือ');
reset role;

select is((select status::text from public.cases where case_code = 'TF26-C1'), 'AWAITING_CONFIRMATION',
  'สถานะ C1 เป็น AWAITING_CONFIRMATION');
select is((select array_agg(to_status::text order by created_at) from public.case_events
  where case_id = pg_temp.id('TF26-C1') and event_type = 'STATUS_CHANGED'),
  array['EN_ROUTE', 'ON_SITE', 'AWAITING_CONFIRMATION'], 'ทุกการเปลี่ยนสถานะมี case_events');
select ok((select metadata ->> 'outcome' = 'HOSPITAL' and (metadata ->> 'peopleHelped')::int = 3
    and note = 'ส่งต่อ รพ.' and actor_role = 'RESCUER'
  from public.case_events where case_id = pg_temp.id('TF26-C1') and to_status = 'AWAITING_CONFIRMATION'
    and event_type = 'STATUS_CHANGED'), 'case_events เก็บผล จำนวนคน และโน้ตตอนช่วยเสร็จ');
select is((select actor_role from public.case_events where case_id = pg_temp.id('TF26-C1') and to_status = 'ON_SITE'
  and event_type = 'STATUS_CHANGED'), 'UNIT_LEAD', 'case_events บอกว่าหัวหน้าเป็นคนเปลี่ยน');
select is((select count(*)::int from public.case_events where case_id = pg_temp.id('TF26-C1') and event_type = 'NOTE_ADDED'), 1,
  'โน้ตบันทึกเป็น NOTE_ADDED');
select is((select count(*)::int from public.case_line_notifications where case_id = pg_temp.id('TF26-C1')
  and kind = 'CLOSE_CONFIRM' and user_id = 'b2600000-0000-0000-0000-000000000006'), 1,
  'ไป AWAITING_CONFIRMATION แล้วผู้แจ้งได้ LINE ให้กดยืนยัน (enqueue_close_confirmation)');
select is((select count(*)::int from public.case_line_notifications where case_id = pg_temp.id('TF26-C1')
  and kind = 'CASE_STATUS' and to_status = 'AWAITING_CONFIRMATION'), 0,
  'ไม่ส่งข้อความสถานะซ้ำกับข้อความขอให้ยืนยัน');

-- ---------- 4. ช่องทางปิดเคสที่อนุญาต ----------
select is((public.reporter_case('TF26-C2', md5('TF26-C2'), 'cancel',
    jsonb_build_object('version', pg_temp.ver('TF26-C2'))) ->> 'version')::int > 0, true,
  'ผู้แจ้งกดปลอดภัยแล้ว (TF-14) ยกเลิกเคสที่ทีมรับแล้วได้เหมือนเดิม');
select is((select status::text from public.cases where case_code = 'TF26-C2'), 'CANCELLED', 'เคส C2 เป็น CANCELLED');

set local role authenticated;
select pg_temp.as_user(2);
select throws_ok($$select public.system_close_cases(array[pg_temp.id('TF26-C3')], 'CANCELLED', 'ทดสอบ')$$,
  '42501', null, 'ผู้ใช้ (แม้เป็นหัวหน้า) เรียก system_close_cases ไม่ได้');
reset role;
select is(public.system_close_cases(array[pg_temp.id('TF26-C1'), pg_temp.id('TF26-C3')], 'RESOLVED', 'ทดสอบระบบ'), 1,
  'ระบบปิดเป็น RESOLVED ได้เฉพาะเคสที่รอผู้แจ้งยืนยัน (C1) ไม่ปิด C3 ที่ยังไม่ช่วยเสร็จ');

select * from finish();
rollback;
