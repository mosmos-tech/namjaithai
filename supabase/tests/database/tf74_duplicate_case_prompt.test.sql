-- ============================================================================
-- TF-74: ส่ง SOS ซ้ำ — ไม่ส่งข้อมูลเคสเดิมกลับไปให้ฟอร์มเว็บ, อัปเดตเคสเดิมได้เฉพาะเครื่องที่ส่งเคสนั้น,
-- เบอร์เดิมจากเครื่องอื่น = รายงานเพิ่มเติม (ไม่แก้ข้อมูลหลัก), กดซ้ำด้วย key เดิมได้ผลเดียว, ไม่นับเคส is_demo
-- รัน: npx supabase test db
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(27);

-- จุดและเบอร์ของไฟล์นี้เอง (ห่างจาก test อื่นเกิน 50 ม.)
create function pg_temp.sos_payload(lat double precision, phone text, extra jsonb) returns jsonb
language sql as $$
  select jsonb_build_object(
    'consent', true, 'healthConsent', true, 'consentVersion', '2026-11-06',
    'urgency', 'YELLOW', 'triageReasons', '["WATER_UNKNOWN"]'::jsonb,
    'canSelfEvacuate', false, 'lat', lat, 'lng', 103.1, 'landmark', 'จุดทดสอบ TF-74',
    'phone', phone, 'name', 'ทดสอบ TF-74', 'adults', 1, 'needs', '[]'::jsonb
  ) || extra
$$;

-- detail ของ SOS49 (สิ่งที่ฟอร์มเว็บได้รับเมื่อพบเคสที่อาจซ้ำ)
create function pg_temp.dup_detail(p_key text, p_payload jsonb) returns jsonb
language plpgsql as $$
declare v_detail text;
begin
  perform public.create_sos_case(p_key, p_payload, 100);
  return null;
exception when sqlstate 'SOS49' then
  get stacked diagnostics v_detail = pg_exception_detail;
  return v_detail::jsonb;
end;
$$;

-- เคสเดิม: เบอร์ 0897400001 ที่จุด 15.90
select lives_ok(
  $$select * from public.create_sos_case('tf74-orig',
      pg_temp.sos_payload(15.90, '0897400001',
        '{"name":"เจ้าของเดิม","landmark":"บ้านเดิม","notes":"โน้ตเดิม"}'), 100)$$,
  'สร้างเคสเดิม'
);
create temp table orig as
  select c.id, c.case_code, c.lat, c.lng, c.landmark, c.version, s.secret
  from public.cases c join rls.case_confirmation_secrets s on s.case_id = c.id
  where c.idempotency_key = 'tf74-orig';

-- ---------- 1. ฟอร์มเว็บไม่ได้ข้อมูลเคสเดิม ----------
select is(
  pg_temp.dup_detail('tf74-ask-phone', pg_temp.sos_payload(15.95, '0897400001', '{}')),
  '{"matchReason":"SAME_PHONE"}'::jsonb,
  'เบอร์เดิม: ได้แค่ว่าเป็นเบอร์เดิม ไม่มีรหัส/ข้อมูลเคสเดิม'
);
select is(
  pg_temp.dup_detail('tf74-ask-near', pg_temp.sos_payload(15.90, '0897400002', '{}')),
  '{"matchReason":"NEARBY_50M"}'::jsonb,
  'คนละเบอร์ใกล้ 50 ม.: ได้แค่ว่าอยู่ใกล้ ไม่มีรหัส/ข้อมูลเคสเดิม'
);

-- ---------- 2. คนละเบอร์ใกล้ 50 ม. ----------
select throws_ok(
  $$select * from public.create_sos_case('tf74-near-update',
      pg_temp.sos_payload(15.90, '0897400002', '{"duplicateAction":"UPDATE_EXISTING"}'), 100)$$,
  'SOS48', null,
  'คนละเบอร์อัปเดตเคสเดิมไม่ได้'
);
create temp table near_new as
  select * from public.create_sos_case('tf74-near-new',
    pg_temp.sos_payload(15.90, '0897400002', '{"duplicateAction":"CREATE_NEW"}'), 100);
select ok(
  (select case_code is not null and case_code <> (select case_code from orig) from near_new),
  'คนละเบอร์กด "ส่งคำขอของฉัน" ได้เคสใหม่ของตัวเอง'
);
select ok(
  (select duplicate_of_case_code is null and duplicate_distance_m is null from near_new),
  'เคสใหม่ไม่ได้รหัสหรือระยะของเคสเดิมกลับไป'
);
select is(
  (select duplicate_of_case_id from public.cases where idempotency_key = 'tf74-near-new'),
  (select id from orig),
  'ระบบยังผูกเคสที่อาจซ้ำไว้ให้แอดมินเห็น'
);

-- ---------- 3. เบอร์เดิมแต่คนละเครื่อง (token ไม่ตรง) = รายงานเพิ่มเติม ----------
create temp table supplement as
  select * from public.create_sos_case('tf74-supplement',
    pg_temp.sos_payload(15.95, '0897400001', jsonb_build_object(
      'duplicateAction', 'UPDATE_EXISTING', 'name', 'ชื่อปลอม', 'landmark', 'ที่อื่น',
      'notes', 'ติดอยู่ชั้นสอง', 'adults', 3,
      'deviceConfirmationTokens', jsonb_build_array('not-the-device-token'))), 100);
select ok(
  (select case_code is null and tracking_token is null and updated_existing from supplement),
  'เครื่องอื่นไม่ได้รหัสเคสหรือลิงก์ติดตาม'
);
select ok(
  (select c.lat = o.lat and c.lng = o.lng and c.landmark = o.landmark and c.version = o.version
     and c.notes = 'โน้ตเดิม'
   from public.cases c join orig o on o.id = c.id),
  'เครื่องอื่นแก้ตำแหน่ง/จุดสังเกต/ข้อมูลเคสเดิมไม่ได้'
);
select is(
  (select array_agg(name || ' ' || phone) from public.case_contacts where case_id = (select id from orig)),
  array['เจ้าของเดิม 0897400001'],
  'เครื่องอื่นแก้ชื่อ/เบอร์ หรือเพิ่มผู้ติดต่อในเคสเดิมไม่ได้'
);
select is(
  (select report ->> 'notes' || ' ' || (report ->> 'adults')
     from public.case_reporter_supplements where idempotency_key = 'tf74-supplement'),
  'ติดอยู่ชั้นสอง 3',
  'ข้อมูลใหม่เก็บเป็นรายงานเพิ่มเติมให้ทีม'
);
select ok(
  (select metadata = jsonb_build_object('source', 'DUPLICATE_CHECK_SUPPLEMENT',
       'idempotency_key', 'tf74-supplement', 'match_reason', 'SAME_PHONE')
   from public.case_events where metadata ->> 'idempotency_key' = 'tf74-supplement'),
  'case_events บันทึกว่ามีรายงานเพิ่ม โดยไม่มีเนื้อหา (กู้ภัยทั้งจังหวัดอ่าน case_events ได้)'
);
select lives_ok(
  $$select * from public.create_sos_case('tf74-supplement',
      pg_temp.sos_payload(15.95, '0897400001', '{"duplicateAction":"UPDATE_EXISTING"}'), 100)$$,
  'กดซ้ำด้วย key เดิมได้'
);
select ok(
  (select count(*) = 1 from public.case_reporter_supplements where idempotency_key = 'tf74-supplement')
  and (select count(*) = 1 from public.case_events where metadata ->> 'idempotency_key' = 'tf74-supplement'),
  'กดซ้ำไม่เพิ่มรายงานหรือเหตุการณ์ซ้ำ'
);
select ok(
  (select case_code is null from public.create_sos_case('tf74-supplement',
      pg_temp.sos_payload(15.95, '0897400001', '{"duplicateAction":"UPDATE_EXISTING"}'), 100)),
  'ส่งซ้ำก็ยังไม่ได้รหัสเคส'
);

-- ---------- 4. เครื่องที่ส่งเคสเดิม (token ตรง) อัปเดตได้ ----------
create temp table owner_update as
  select * from public.create_sos_case('tf74-owner',
    pg_temp.sos_payload(15.90, '0897400001', jsonb_build_object(
      'duplicateAction', 'UPDATE_EXISTING', 'landmark', 'บ้านเดิม ชั้นสอง',
      'deviceConfirmationTokens', jsonb_build_array('other-token', (select secret from orig)))), 100);
select is(
  (select case_code from owner_update), (select case_code from orig),
  'เครื่องเดิมได้รหัสเคสเดิมกลับไปติดตามต่อ'
);
select is(
  (select landmark from public.cases where id = (select id from orig)), 'บ้านเดิม ชั้นสอง',
  'เครื่องเดิมอัปเดตข้อมูลเคสได้'
);
select lives_ok(
  $$select * from public.create_sos_case('tf74-owner',
      pg_temp.sos_payload(15.90, '0897400001', '{"duplicateAction":"UPDATE_EXISTING"}'), 100)$$,
  'กดอัปเดตซ้ำด้วย key เดิมได้'
);
select is(
  (select count(*)::int from public.case_events where metadata ->> 'idempotency_key' = 'tf74-owner'),
  1,
  'กดอัปเดตซ้ำไม่อัปเดตเคสซ้ำ'
);

-- ---------- 4.1 เรียกด้วยสิทธิ์เดียวกับ /api/cases (service_role) ----------
grant select on orig to service_role;
set local role service_role;
select lives_ok(
  $$select * from public.create_sos_case('tf74-svc-new',
      pg_temp.sos_payload(15.70, '0897400005', '{}'), 100)$$,
  'service_role สร้างเคสใหม่ได้ (ไม่ต้องอ่านตาราง rls.* เอง)'
);
select is(
  (select case_code from public.create_sos_case('tf74-svc-owner',
      pg_temp.sos_payload(15.90, '0897400001', jsonb_build_object(
        'duplicateAction', 'UPDATE_EXISTING',
        'deviceConfirmationTokens', jsonb_build_array((select secret from orig)))), 100)),
  (select case_code from orig),
  'service_role: เครื่องเดิมอัปเดตเคสเดิมได้'
);
select ok(
  (select case_code is null from public.create_sos_case('tf74-svc-other',
      pg_temp.sos_payload(15.95, '0897400001', '{"duplicateAction":"UPDATE_EXISTING"}'), 100)),
  'service_role: เครื่องอื่นได้แค่รายงานเพิ่มเติม'
);
reset role;

-- ---------- 5. ไม่นับเคสตัวอย่าง (TF-70) ----------
insert into public.units(id, name, province, source)
  values ('c7400000-0000-0000-0000-000000000001', 'TF74 หน่วยตัวอย่าง', 'TF74 จังหวัด', 'DEMO');
insert into public.cases(case_code, status, urgency, lat, lng, landmark, incident_type, is_demo, assigned_unit_id)
  values ('TF74-DEMO', 'NEW', 'RED', 16.20, 103.1, 'เคสตัวอย่าง', 'FLOOD', true,
          'c7400000-0000-0000-0000-000000000001');
insert into public.case_contacts(case_id, name, phone, phone_last4)
  select id, 'ตัวอย่าง', '0897400009', '0009' from public.cases where case_code = 'TF74-DEMO';
select is(
  pg_temp.dup_detail('tf74-demo-phone', pg_temp.sos_payload(16.30, '0897400009', '{}')),
  null,
  'เบอร์เดียวกับเคสตัวอย่าง: ไม่ถามเคสซ้ำ สร้างเคสใหม่ได้เลย'
);
select is(
  pg_temp.dup_detail('tf74-demo-near', pg_temp.sos_payload(16.20, '0897400008', '{}')),
  null,
  'ใกล้เคสตัวอย่าง: ไม่ถามเคสซ้ำ'
);

-- ---------- 6. รายงานเพิ่มเติมเห็นเฉพาะทีมที่รับเคส ----------
insert into auth.users(id) values ('a7400000-0000-0000-0000-000000000001');
insert into public.users(id, auth_user_id, display_name, role, status)
  values ('b7400000-0000-0000-0000-000000000001', 'a7400000-0000-0000-0000-000000000001',
          'TF74 กู้ภัยหน่วยอื่น', 'RESCUER', 'ACTIVE');
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a7400000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.case_reporter_supplements), 0,
  'กู้ภัยที่ไม่ได้รับเคสอ่านรายงานเพิ่มเติมไม่ได้');
select throws_ok($$update public.case_reporter_supplements set report = '{}'$$, '42501', null,
  'แก้รายงานเพิ่มเติมไม่ได้');
reset role;
select throws_ok($$delete from public.case_reporter_supplements$$, null, null,
  'ลบรายงานเพิ่มเติมไม่ได้ (append-only)');

select * from finish();
rollback;
