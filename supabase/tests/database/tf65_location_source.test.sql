-- ============================================================================
-- TF-65: วิธีได้พิกัด (location_source), accuracy_m ของการปักเอง/วางลิงก์ และที่อยู่ละเอียด
-- รัน: npx supabase test db
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(14);

-- จุดห่างกันเกิน 50 ม. และเบอร์ไม่ซ้ำ จะได้ไม่ชนการตรวจเคสซ้ำ (TF-16)
create function pg_temp.sos_payload(lat double precision, phone text, extra jsonb) returns jsonb
language sql as $$
  select jsonb_build_object(
    'consent', true, 'healthConsent', true, 'consentVersion', '2026-11-06',
    'urgency', 'YELLOW', 'triageReasons', '["WATER_UNKNOWN"]'::jsonb,
    'canSelfEvacuate', false, 'lat', lat, 'lng', 99.95, 'landmark', 'หน้าวัด',
    'phone', phone, 'name', 'ทดสอบ TF-65', 'adults', 1, 'needs', '[]'::jsonb
  ) || extra
$$;

-- ---------- GPS ไม่แม่นแต่ส่งพร้อมที่อยู่: เก็บ GPS + accuracy เดิม + ที่อยู่ ----------
select lives_ok(
  $$select * from public.create_sos_case('tf65-gps',
      pg_temp.sos_payload(14.61, '0899996501',
        '{"locationSource":"GPS","accuracyM":16238,"addressLine":"99/1 หมู่ 3"}'), 100)$$,
  'สร้างเคสจาก GPS ไม่แม่นพร้อมที่อยู่ได้'
);
select is(
  (select location_source || ' ' || accuracy_m from public.cases where idempotency_key = 'tf65-gps'),
  'GPS 16238',
  'GPS: เก็บวิธีได้พิกัดและ accuracy เดิม'
);
select ok(
  (select consent_version = '2026-11-06' and consented_at is not null and health_consented_at is not null
     from public.cases where idempotency_key = 'tf65-gps'),
  'GPS: บันทึกความยินยอมพร้อมพิกัด'
);
select is(
  (select cc.detailed_address from public.case_contacts cc
     join public.cases c on c.id = cc.case_id where c.idempotency_key = 'tf65-gps'),
  '99/1 หมู่ 3',
  'ที่อยู่ละเอียดเก็บใน case_contacts (เห็นเฉพาะทีมที่รับเคสและแอดมิน)'
);

-- ---------- ปักเอง / วางลิงก์: accuracy_m = null แม้คำขอส่งมา ----------
select lives_ok(
  $$select * from public.create_sos_case('tf65-pin',
      pg_temp.sos_payload(14.62, '0899996502', '{"locationSource":"MANUAL_PIN","accuracyM":500}'), 100)$$,
  'สร้างเคสจากการปักหมุดเองได้'
);
select ok(
  (select location_source = 'MANUAL_PIN' and accuracy_m is null
     from public.cases where idempotency_key = 'tf65-pin'),
  'MANUAL_PIN: accuracy_m เป็น null'
);
select lives_ok(
  $$select * from public.create_sos_case('tf65-link',
      pg_temp.sos_payload(14.63, '0899996503', '{"locationSource":"GMAPS_LINK","accuracyM":500}'), 100)$$,
  'สร้างเคสจากลิงก์ Google Maps ได้'
);
select ok(
  (select location_source = 'GMAPS_LINK' and accuracy_m is null
     from public.cases where idempotency_key = 'tf65-link'),
  'GMAPS_LINK: accuracy_m เป็น null'
);

-- ---------- ร่างรุ่นเก่าไม่ส่งวิธีมา = ไม่ทราบ ----------
select lives_ok(
  $$select * from public.create_sos_case('tf65-legacy',
      pg_temp.sos_payload(14.64, '0899996504', '{"accuracyM":20}'), 100)$$,
  'คำขอที่ไม่ส่ง locationSource ยังสร้างเคสได้'
);
select ok(
  (select location_source is null and accuracy_m = 20
     from public.cases where idempotency_key = 'tf65-legacy'),
  'ไม่ส่งวิธีมา: location_source เป็น null และเก็บ accuracy ตามที่ส่ง'
);

-- ---------- อัปเดตเคสเดิมด้วยการปักเอง: ล้าง accuracy เดิม ----------
select lives_ok(
  format($$select * from public.create_sos_case('tf65-pin-update',
      pg_temp.sos_payload(14.61, '0899996501',
        jsonb_build_object('locationSource', 'MANUAL_PIN', 'duplicateAction', 'UPDATE_EXISTING',
          'targetCaseId', %L,
          -- TF-74: อัปเดตข้อมูลเคสได้เฉพาะเครื่องที่ส่งเคสเดิม (มี token ยืนยันของเคสนั้น)
          'deviceConfirmationTokens', jsonb_build_array(%L))), 100)$$,
    (select id from public.cases where idempotency_key = 'tf65-gps'),
    (select s.secret from rls.case_confirmation_secrets s
       join public.cases c on c.id = s.case_id where c.idempotency_key = 'tf65-gps')),
  'อัปเดตเคสเดิมด้วยหมุดที่ปักเองได้'
);
select ok(
  (select location_source = 'MANUAL_PIN' and accuracy_m is null
     from public.cases where idempotency_key = 'tf65-gps'),
  'อัปเดตเคสเดิมด้วยการปักเอง: accuracy_m GPS เดิมถูกล้างเป็น null'
);
select ok(
  (select consent_version = '2026-11-06' and consented_at is not null and health_consented_at is not null
     from public.cases where idempotency_key = 'tf65-gps'),
  'อัปเดตเคสเดิม: บันทึกความยินยอมพร้อมพิกัดใหม่'
);

-- ---------- ค่าที่ไม่รู้จักถูกปฏิเสธ ----------
select throws_ok(
  $$update public.cases set location_source = 'GUESS' where idempotency_key = 'tf65-pin'$$,
  '23514',
  null,
  'location_source รับเฉพาะ GPS / MANUAL_PIN / GMAPS_LINK'
);

select * from finish();
rollback;
