-- ============================================================================
-- TF-55: ระดับความเร่งด่วนที่ระบบคำนวณ + กู้ภัยปรับระดับพร้อมเหตุผล
-- รัน: npx supabase test db
--
-- ตัวละคร
--   admin  แอดมิน
--   lead   หัวหน้าหน่วย U1           r1  กู้ภัย U1 ที่รับเคส T1
--   r3     กู้ภัย U1 ที่ไม่ได้รับเคส (อยู่จังหวัดเดียวกัน เห็นเคสแต่ปรับไม่ได้)
-- เคส
--   T1  เหลือง r1 / หน่วย U1 รับแล้ว
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(20);

-- ---------- create_sos_case(): บันทึกผลจาก computeTriage ----------
create function pg_temp.sos_payload(extra jsonb) returns jsonb language sql as $$
  select jsonb_build_object(
    'consent', true, 'healthConsent', true, 'consentVersion', '2026-11-06',
    'urgency', 'RED', 'triageReasons', '["DANGER_SIGN"]'::jsonb,
    'canSelfEvacuate', false, 'lat', 14.55, 'lng', 100.95, 'landmark', 'หน้าวัด',
    'phone', '0899990055', 'name', 'ทดสอบ TF-55', 'adults', 1, 'needs', '[]'::jsonb
  ) || extra
$$;

select lives_ok(
  $$select * from public.create_sos_case('tf55-a',
      pg_temp.sos_payload('{"waterLevel":"ROOF","sensitive":{"dangerSigns":["UNCONSCIOUS"],"hasInjured":true}}'),
      10020)$$,
  'create_sos_case: สร้างเคสพร้อมผลคำนวณระดับได้'
);
select is(
  (select urgency::text || ' ' || array_to_string(triage_reasons, ',') from public.cases where idempotency_key = 'tf55-a'),
  'RED DANGER_SIGN',
  'บันทึกระดับและเหตุผลจาก computeTriage'
);
select is(
  (select details from public.cases where idempotency_key = 'tf55-a'),
  '{"waterLevel": "ROOF", "canSelfEvacuate": false}'::jsonb,
  'details เก็บระดับน้ำและออกเองได้ไหม ไม่มีคำตอบด้านสุขภาพ'
);
select is(
  (select s.details from public.case_sensitive_details s
   join public.cases c on c.id = s.case_id where c.idempotency_key = 'tf55-a'),
  '{"dangerSigns": ["UNCONSCIOUS"], "hasInjured": true}'::jsonb,
  'คำตอบด้านสุขภาพลง case_sensitive_details'
);
select lives_ok(
  $$select * from public.create_sos_case('tf55-b',
      pg_temp.sos_payload('{"phone":"0899990056","lat":15.55,"urgency":"GREEN","triageReasons":["SUPPLIES_ONLY"]}'),
      100)$$,
  'สร้างเคสที่ไม่มีคำตอบด้านสุขภาพได้'
);
select is(
  (select count(*)::int from public.case_sensitive_details s
   join public.cases c on c.id = s.case_id where c.idempotency_key = 'tf55-b'),
  0,
  'ไม่มีคำตอบด้านสุขภาพ = ไม่สร้างแถวใน case_sensitive_details'
);
select throws_ok(
  $$select * from public.create_sos_case('tf55-c',
      pg_temp.sos_payload('{"phone":"0899990057","lat":16.55,"triageReasons":[]}'), 100)$$,
  '22023', null, 'ไม่มีเหตุผลของระดับ = สร้างเคสไม่ได้ (ต้องผ่าน computeTriage เสมอ)'
);
select throws_ok(
  $$update public.cases set details = '{"dangerSigns":["UNCONSCIOUS"]}' where idempotency_key = 'tf55-b'$$,
  '23514', null, 'cases.details ห้ามมีสัญญาณอันตราย (ข้อมูลสุขภาพ)'
);

-- ---------- ผู้แจ้งไม่เห็นระดับ ----------
select ok(
  not (public.get_case_tracking(
    (select case_code from public.cases where idempotency_key = 'tf55-a'), null,
    (select tracking_token from public.cases where idempotency_key = 'tf55-a')) ? 'urgency'),
  'หน้าติดตามเคสไม่มี urgency'
);
-- ส่งซ้ำเบอร์เดิม = ถามเคสซ้ำ (SOS49) ข้อมูลเคสเดิมที่ส่งกลับไปต้องไม่มีระดับ
create function pg_temp.sos49_detail() returns jsonb language plpgsql as $$
declare v_detail text;
begin
  perform * from public.create_sos_case('tf55-dup',
    pg_temp.sos_payload('{"phone":"0899990055","lat":14.55}'), 100);
  return null;
exception when sqlstate 'SOS49' then
  get stacked diagnostics v_detail = pg_exception_detail;
  return v_detail::jsonb;
end $$;
select ok(
  (select d ? 'caseCode' and not d ? 'urgency' from pg_temp.sos49_detail() d),
  'ข้อมูลเคสซ้ำ (SOS49) ที่ส่งกลับไปให้ผู้แจ้งไม่มี urgency'
);

-- ---------- override_case_urgency(): สิทธิ์ เหตุผล และ audit_logs ----------
insert into auth.users (id) values
  ('a0000000-0000-0000-0000-000000000551'), ('a0000000-0000-0000-0000-000000000552'),
  ('a0000000-0000-0000-0000-000000000553'), ('a0000000-0000-0000-0000-000000000554');

insert into public.users (id, auth_user_id, line_user_id, display_name, role, status) values
  ('b0000000-0000-0000-0000-000000000551', 'a0000000-0000-0000-0000-000000000551', 'U55admin', 'admin', 'ADMIN', 'ACTIVE'),
  ('b0000000-0000-0000-0000-000000000552', 'a0000000-0000-0000-0000-000000000552', 'U55lead', 'lead', 'UNIT_LEAD', 'ACTIVE'),
  ('b0000000-0000-0000-0000-000000000553', 'a0000000-0000-0000-0000-000000000553', 'U55r1', 'r1', 'RESCUER', 'ACTIVE'),
  ('b0000000-0000-0000-0000-000000000554', 'a0000000-0000-0000-0000-000000000554', 'U55r3', 'r3', 'RESCUER', 'ACTIVE');

insert into public.units (id, name, province) values
  ('c0000000-0000-0000-0000-000000000551', 'หน่วย 55', 'กรุงเทพมหานคร');
insert into public.unit_members (user_id, unit_id, role_in_unit, status) values
  ('b0000000-0000-0000-0000-000000000552', 'c0000000-0000-0000-0000-000000000551', 'LEAD', 'APPROVED'),
  ('b0000000-0000-0000-0000-000000000553', 'c0000000-0000-0000-0000-000000000551', 'MEMBER', 'APPROVED'),
  ('b0000000-0000-0000-0000-000000000554', 'c0000000-0000-0000-0000-000000000551', 'MEMBER', 'APPROVED');

insert into public.cases (id, case_code, urgency, triage_reasons, lat, lng, landmark, province,
                          assigned_rescuer_id, assigned_unit_id, status) values
  ('d0000000-0000-0000-0000-000000000551', 'T-T1', 'YELLOW', '{CANNOT_SELF_EVACUATE}', 13.76, 100.53, 'x',
   'กรุงเทพมหานคร', 'b0000000-0000-0000-0000-000000000553', 'c0000000-0000-0000-0000-000000000551', 'ACCEPTED');

create function pg_temp.as_user(auth_id text) returns void language sql as $$
  select set_config('request.jwt.claims',
    jsonb_build_object('sub', auth_id, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.t1() returns public.cases language sql as $$
  select * from public.cases where id = 'd0000000-0000-0000-0000-000000000551'
$$;
grant execute on all functions in schema pg_temp to authenticated;

set local role authenticated;

select pg_temp.as_user('a0000000-0000-0000-0000-000000000554');
select throws_ok(
  $$select public.override_case_urgency('d0000000-0000-0000-0000-000000000551', 'RED', 'ดูจากแผนที่แล้วน่าจะหนัก', 10000, 1)$$,
  '42501', null, 'กู้ภัยในพื้นที่ที่ไม่ได้รับเคส: ปรับระดับไม่ได้'
);

select pg_temp.as_user('a0000000-0000-0000-0000-000000000553');
select throws_ok(
  $$select public.override_case_urgency('d0000000-0000-0000-0000-000000000551', 'RED', '   ', 10000, 1)$$,
  '22023', null, 'กู้ภัยที่รับเคส: ไม่ใส่เหตุผล ปรับไม่ได้'
);
select throws_ok(
  $$select public.override_case_urgency('d0000000-0000-0000-0000-000000000551', 'RED', 'ผู้ป่วยหายใจลำบาก', 10000, 99)$$,
  'SOS41', null, 'version ไม่ตรง (มีคนแก้ไปก่อน) ปรับไม่ได้'
);
select throws_ok(
  $$update public.cases set urgency = 'RED' where id = 'd0000000-0000-0000-0000-000000000551'$$,
  '42501', null, 'แก้คอลัมน์ urgency ตรงๆ ไม่ได้ ต้องผ่านฟังก์ชัน'
);
select is(
  public.override_case_urgency('d0000000-0000-0000-0000-000000000551', 'RED', 'ถึงที่แล้ว ผู้ป่วยหายใจลำบาก', 10005, 1),
  2,
  'กู้ภัยที่รับเคส: ปรับเป็นแดงได้ คืน version ใหม่'
);

select pg_temp.as_user('a0000000-0000-0000-0000-000000000552');
select lives_ok(
  $$select public.override_case_urgency('d0000000-0000-0000-0000-000000000551', 'YELLOW', 'หัวหน้าตรวจแล้ว อาการทรงตัว', 1005, 2)$$,
  'หัวหน้าของหน่วยที่รับเคส: ปรับได้'
);

select pg_temp.as_user('a0000000-0000-0000-0000-000000000551');
select lives_ok(
  $$select public.override_case_urgency('d0000000-0000-0000-0000-000000000551', 'GREEN', 'แอดมินยืนยันกับผู้แจ้งแล้ว ปลอดภัย', 105, 3)$$,
  'แอดมิน: ปรับได้'
);
reset role;

select is(
  (select urgency::text || '/' || system_urgency::text || '/' || urgency_override_reason from pg_temp.t1()),
  'GREEN/YELLOW/แอดมินยืนยันกับผู้แจ้งแล้ว ปลอดภัย',
  'เก็บระดับที่ระบบคำนวณไว้ (system_urgency) แม้ปรับหลายรอบ และเก็บเหตุผลล่าสุด'
);
select is(
  -- ทั้ง 3 ครั้งอยู่ใน transaction เดียว เวลาเท่ากัน จึงเรียงตามข้อความแทน
  (select string_agg(t, ',' order by t) from (
     select metadata ->> 'from' || '>' || (metadata ->> 'to') as t
     from public.audit_logs where case_id = 'd0000000-0000-0000-0000-000000000551'
       and action = 'CASE_URGENCY_OVERRIDDEN') x),
  'RED>YELLOW,YELLOW>GREEN,YELLOW>RED',
  'ทุกการปรับมีแถวใน audit_logs'
);
select is(
  (select count(*)::int from public.audit_logs
   where case_id = 'd0000000-0000-0000-0000-000000000551'
     and metadata ->> 'reason' is not null and actor_user_id is not null),
  3,
  'audit_logs เก็บเหตุผลและคนที่ปรับทุกแถว'
);

select * from finish();
rollback;
