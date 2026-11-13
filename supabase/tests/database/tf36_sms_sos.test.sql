-- ============================================================================
-- TF-36: SOS ผ่าน SMS — ช่องทาง SMS ใน create_sos_case, กันซ้ำ, จำกัดการตอบ, SMS ซ้ำ, ล้างข้อมูล 90 วัน
-- รัน: npx supabase test db
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(31);

create function pg_temp.sms_payload(phone text, lat double precision, extra jsonb default '{}') returns jsonb
language sql as $$
  select jsonb_build_object(
    'channel', 'SMS', 'consent', true, 'consentVersion', 'SMS-2026-11-08',
    'incidentType', 'FLOOD', 'canSelfEvacuate', false, 'waterLevel', 'ROOF',
    'lat', lat, 'lng', 99.0, 'accuracyM', 15, 'locationSource', 'GPS',
    'landmark', 'แจ้งทาง SMS', 'name', 'ผู้แจ้งทาง SMS', 'phone', phone,
    'adults', 2, 'elderly', 0, 'bedridden', 0, 'children', 0, 'pets', 0, 'needs', '[]'::jsonb,
    'urgency', 'RED', 'triageReasons', '["WATER_ROOF"]'::jsonb
  ) || extra
$$;

-- ---------- 1. create_sos_case ช่องทาง SMS ----------
select lives_ok($$select * from public.create_sos_case('tf36-sms-1', pg_temp.sms_payload('0899360001', 7.50), 100)$$,
  'SMS สร้างเคสได้ด้วยความยินยอมฉบับ SMS (ไม่ต้องมีความยินยอมข้อมูลสุขภาพ)');
select is((select source from public.cases where idempotency_key = 'tf36-sms-1'), 'SMS', 'เคสบันทึกช่องทาง SMS');
select is((select location_source from public.cases where idempotency_key = 'tf36-sms-1'), 'SMS',
  'location_source = SMS แม้ payload จะส่งค่าอื่นมา');
select is((select accuracy_m from public.cases where idempotency_key = 'tf36-sms-1'), null::double precision,
  'accuracy_m = null สำหรับพิกัดจาก SMS');
select is((select consent_version from public.cases where idempotency_key = 'tf36-sms-1'), 'SMS-2026-11-08',
  'บันทึก consent_version ของช่องทาง SMS แยกจากฟอร์มเว็บ');
select ok((select consented_at is not null and health_consented_at is null from public.cases where idempotency_key = 'tf36-sms-1'),
  'บันทึกเวลายินยอม แต่ไม่บันทึกความยินยอมข้อมูลสุขภาพ (SMS ไม่ได้ถาม)');
select is((select e.metadata ->> 'source' from public.case_events e join public.cases c on c.id = e.case_id
  where c.idempotency_key = 'tf36-sms-1' and e.event_type = 'CREATED'), 'SMS', 'ไทม์ไลน์ CREATED บอกว่ามาจาก SMS');

select throws_ok($$select * from public.create_sos_case('tf36-sms-2',
  pg_temp.sms_payload('0899360002', 7.60, '{"consentVersion":"2026-11-06"}'), 100)$$,
  '22023', 'consent required', 'SMS ใช้ฉบับความยินยอมของเว็บไม่ได้');
select throws_ok($$select * from public.create_sos_case('tf36-sms-3',
  pg_temp.sms_payload('0899360003', 7.70, '{"channel":"WEB","healthConsent":true,"consentVersion":"2026-11-06","locationSource":"SMS"}'), 100)$$,
  '22023', null, 'ฟอร์มเว็บแอบอ้างว่าพิกัดมาจาก SMS ไม่ได้');
select throws_ok($$select * from public.create_sos_case('tf36-sms-4',
  pg_temp.sms_payload('0899360001', 7.50, '{"duplicateAction":"UPDATE_EXISTING"}'), 100)$$,
  '22023', 'SMS cannot update an existing case', 'SMS อัปเดตเคสเดิมไม่ได้');
select throws_ok($$select * from public.create_sos_case('tf36-sms-5', pg_temp.sms_payload('0899360001', 7.80), 100)$$,
  'SOS49', null, 'เบอร์เดิมมีเคสเปิดอยู่ ได้ SOS49 (webhook ตอบรหัสเคสเดิมกลับ)');
select throws_ok($$select * from public.create_sos_case('tf36-sms-6',
  pg_temp.sms_payload('0899360006', 7.90, '{"channel":"FAX"}'), 100)$$,
  '22023', null, 'ช่องทางอื่นนอกจาก WEB/SMS ไม่รับ');

-- ---------- 2. record_sms_inbound กันข้อความเดิม ----------
create temp table r1 as select * from public.record_sms_inbound('httpsms', 'tf36-msg-1', '0899360010');
create temp table r1b as select * from public.record_sms_inbound('httpsms', 'tf36-msg-1', '0899360010');
select is((select handled from r1), false, 'ข้อความใหม่ยังไม่ได้ประมวลผล');
select is((select id from r1b), (select id from r1), 'ข้อความเดิมได้แถวเดิม ไม่เพิ่มแถว');

-- ---------- 3. finish_sms_inbound จำกัดการตอบ ----------
select is(public.finish_sms_inbound((select id from r1), 'INVALID', null, null, null, 'NOT_SOS', 'HELP'), true,
  'ข้อความผิดรูปแบบครั้งแรก ตอบวิธีส่งที่ถูก');
select is((select handled from public.record_sms_inbound('httpsms', 'tf36-msg-1', '0899360010')), true,
  'ประมวลผลแล้ว ผู้ให้บริการส่งซ้ำจะไม่ทำซ้ำ');
create temp table r2 as select * from public.record_sms_inbound('httpsms', 'tf36-msg-2', '0899360010');
select is(public.finish_sms_inbound((select id from r2), 'INVALID', null, null, null, 'BAD_FORMAT', 'HELP'), false,
  'ผิดรูปแบบซ้ำภายใน 10 นาที ไม่ตอบอีก (กันวนลูปกับเครื่องตอบอัตโนมัติ)');
create temp table r3 as select * from public.record_sms_inbound('httpsms', 'tf36-msg-3', '0899360010');
select is(public.finish_sms_inbound((select id from r3), 'CREATED',
  (select id from public.cases where idempotency_key = 'tf36-sms-1'), 7.5, 99.0, null, 'CREATED'), true,
  'สร้างเคสสำเร็จตอบเสมอ แม้เพิ่งตอบไป');
create temp table r4 as select * from public.record_sms_inbound('httpsms', 'tf36-msg-4', '0899360011');
select is(public.finish_sms_inbound((select id from r4), 'INVALID', null, null, null, 'NOT_SOS', 'HELP'), true,
  'เบอร์อื่นไม่โดนจำกัดตามเบอร์แรก');
update public.sms_inbound_messages set replied_at = now() - interval '11 minutes' where id = (select id from r1);
create temp table r5 as select * from public.record_sms_inbound('httpsms', 'tf36-msg-5', '0899360010');
select is(public.finish_sms_inbound((select id from r5), 'INVALID', null, null, null, 'NOT_SOS', 'HELP'), true,
  'พ้น 10 นาทีแล้วตอบได้อีก');

-- ---------- 4. SMS ซ้ำจากเบอร์ที่มีเคสเปิดอยู่ ----------
create temp table r6 as select * from public.record_sms_inbound('httpsms', 'tf36-msg-6', '0899360001');
select is(public.finish_sms_inbound((select id from r6), 'REPEAT',
  (select id from public.cases where idempotency_key = 'tf36-sms-1'), 7.5, 99.0, null, 'REPEAT'), true,
  'ตอบรหัสเคสเดิมกลับ');
select is((select metadata from public.case_events e join public.cases c on c.id = e.case_id
  where c.idempotency_key = 'tf36-sms-1' and e.event_type = 'SMS_REPEATED'), '{"channel": "SMS"}'::jsonb,
  'บันทึก case_events ว่าผู้แจ้งส่ง SMS ซ้ำ โดยไม่เก็บเนื้อความ');
create temp table r7 as select * from public.record_sms_inbound('httpsms', 'tf36-msg-7', '0899360001');
select is(public.finish_sms_inbound((select id from r7), 'REPEAT',
  (select id from public.cases where idempotency_key = 'tf36-sms-1'), 7.5, 99.0, null, 'REPEAT'), false,
  'SMS ซ้ำอีกภายใน 10 นาที ไม่ตอบซ้ำ');
select is((select count(*)::int from public.case_events e join public.cases c on c.id = e.case_id
  where c.idempotency_key = 'tf36-sms-1' and e.event_type = 'SMS_REPEATED'), 1,
  'SMS ซ้ำถี่ๆ ไม่ท่วมไทม์ไลน์ (ไม่เกิน 1 ครั้งต่อเคสต่อ 10 นาที)');

-- ---------- 5. สิทธิ์ ----------
select ok(not has_function_privilege('authenticated', 'public.record_sms_inbound(text, text, text)', 'execute'),
  'ผู้ใช้เว็บเรียก record_sms_inbound เองไม่ได้');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a3600000-0000-0000-0000-000000000099","role":"authenticated"}', true);
select is((select count(*)::int from public.sms_inbound_messages), 0, 'ผู้ใช้ที่ไม่ใช่แอดมินมองไม่เห็นเบอร์/พิกัดจาก SMS');
reset role;

-- ---------- 6. ล้างเบอร์และพิกัดเมื่อเกิน 90 วัน ----------
update public.sms_inbound_messages set created_at = now() - interval '91 days' where id in ((select id from r1), (select id from r3));
select is(public.purge_sms_inbound_pii(), 2, 'ล้างเฉพาะแถวที่เกิน 90 วัน');
select ok((select phone is null and lat is null and lng is null and pii_purged_at is not null and result = 'CREATED'
  from public.sms_inbound_messages where id = (select id from r3)),
  'เบอร์และพิกัดหายไป เหลือผลไว้ทำสถิติ');
select ok((select phone = '0899360010' from public.sms_inbound_messages where id = (select id from r5)),
  'แถวที่ยังไม่ถึง 90 วันเก็บเบอร์ไว้');
select is((select (metadata ->> 'rows')::int from public.audit_logs where action = 'SMS_PII_PURGED' order by created_at desc limit 1), 2,
  'มีบันทึกใน audit_logs ทุกรอบที่ลบ');
select is((select count(*)::int from cron.job where jobname = 'tf36-sms-inbound-retention'), 1,
  'มีงาน pg_cron ล้างข้อมูลทุกคืน (TODO(TF-44) รวมกับงานของ TF-44)');

select * from finish();
rollback;
