-- ============================================================================
-- TF-63: ภาษาของผู้แจ้ง (cases.reporter_locale) — เก็บจากฟอร์ม, ค่าอื่น/ไม่ส่ง = ไทย, คิว LINE ส่งภาษาให้ worker
-- รัน: npx supabase test db
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(6);

-- จุดห่างกันเกิน 50 ม. และเบอร์ไม่ซ้ำ จะได้ไม่ชนการตรวจเคสซ้ำ (TF-16)
create function pg_temp.sos_payload(lat double precision, phone text, extra jsonb) returns jsonb
language sql as $$
  select jsonb_build_object(
    'consent', true, 'healthConsent', true, 'consentVersion', '2026-11-06',
    'urgency', 'YELLOW', 'triageReasons', '["WATER_UNKNOWN"]'::jsonb,
    'canSelfEvacuate', false, 'lat', lat, 'lng', 99.95, 'landmark', 'Blue hotel',
    'phone', phone, 'name', 'TF-63 tourist', 'adults', 1, 'needs', '[]'::jsonb
  ) || extra
$$;

select lives_ok(
  $$select * from public.create_sos_case('tf63-en',
      pg_temp.sos_payload(14.71, '0899996301', '{"reporterLocale":"en"}'), 100)$$,
  'สร้างเคสจากฟอร์มภาษาอังกฤษได้'
);
select is((select reporter_locale from public.cases where idempotency_key = 'tf63-en'), 'en',
  'ฟอร์มภาษาอังกฤษ: เก็บ reporter_locale = en');

select lives_ok(
  $$select * from public.create_sos_case('tf63-default',
      pg_temp.sos_payload(14.72, '0899996302', '{}'), 100)$$,
  'สร้างเคสโดยไม่ส่งภาษาได้ (ฟอร์มรุ่นเก่า / SMS)'
);
select is((select reporter_locale from public.cases where idempotency_key = 'tf63-default'), 'th',
  'ไม่ส่งภาษา = ไทย');

select lives_ok(
  $$select * from public.create_sos_case('tf63-junk',
      pg_temp.sos_payload(14.73, '0899996303', '{"reporterLocale":"fr"}'), 100)$$,
  'ภาษาที่ไม่รองรับไม่ทำให้ส่ง SOS ไม่ได้'
);
select is((select reporter_locale from public.cases where idempotency_key = 'tf63-junk'), 'th',
  'ภาษาที่ไม่รองรับ = ไทย');

select * from finish();
rollback;
