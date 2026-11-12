begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(79);

insert into public.units(id, name, province)
values ('c4400000-0000-0000-0000-000000000001', 'TF44 unit', 'กรุงเทพมหานคร');
insert into public.units(id, name, province, source)
values ('c4400000-0000-0000-0000-000000000002', 'TF44 demo unit', 'กรุงเทพมหานคร', 'DEMO');

insert into public.cases(id, case_code, status, urgency, lat, lng, landmark, province, incident_type, closed_at)
values
  ('d4400000-0000-0000-0000-000000000001', 'TF44-OLD', 'RESOLVED', 'GREEN', 13.7, 100.5, 'TF44', 'กรุงเทพมหานคร', 'FLOOD', now() - interval '91 days'),
  ('d4400000-0000-0000-0000-000000000002', 'TF44-RECENT', 'CANCELLED', 'YELLOW', 13.7, 100.5, 'TF44', 'กรุงเทพมหานคร', 'FLOOD', now() - interval '89 days'),
  ('d4400000-0000-0000-0000-000000000003', 'TF44-OPEN', 'NEW', 'GREEN', 13.7, 100.5, 'TF44', 'กรุงเทพมหานคร', 'FLOOD', now() - interval '100 days'),
  ('d4400000-0000-0000-0000-000000000004', 'TF44-BOUNDARY', 'CANCELLED', 'RED', 13.7, 100.5, 'TF44', 'กรุงเทพมหานคร', 'FLOOD', now() - interval '90 days'),
  ('d4400000-0000-0000-0000-000000000005', 'TF44-NO-CLOSE', 'RESOLVED', 'GREEN', 13.7, 100.5, 'TF44', 'กรุงเทพมหานคร', 'FLOOD', null),
  ('d4400000-0000-0000-0000-000000000006', 'TF44-HEALTH', 'UNREACHABLE', 'GREEN', 13.7, 100.5, 'TF44', 'กรุงเทพมหานคร', 'FLOOD', now() - interval '91 days'),
  ('d4400000-0000-0000-0000-000000000009', 'TF44-PRIMARY-CLOSED', 'RESOLVED', 'YELLOW', 13.7, 100.5, 'TF44', 'กรุงเทพมหานคร', 'FLOOD', now() - interval '91 days');
insert into public.cases(id, case_code, status, urgency, lat, lng, landmark, province, incident_type, closed_at, duplicate_of_case_id)
values
  ('d4400000-0000-0000-0000-000000000007', 'TF44-MERGED', 'DUPLICATE', 'RED', 13.7, 100.5, 'TF44', 'กรุงเทพมหานคร', 'FLOOD', now() - interval '91 days', 'd4400000-0000-0000-0000-000000000009'),
  ('d4400000-0000-0000-0000-00000000000a', 'TF44-MERGED-WAIT', 'DUPLICATE', 'RED', 13.7, 100.5, 'TF44', 'กรุงเทพมหานคร', 'FLOOD', now() - interval '91 days', 'd4400000-0000-0000-0000-000000000002'),
  ('d4400000-0000-0000-0000-00000000000b', 'TF44-MERGED-OPEN', 'DUPLICATE', 'RED', 13.7, 100.5, 'TF44', 'กรุงเทพมหานคร', 'FLOOD', now() - interval '91 days', 'd4400000-0000-0000-0000-000000000003');
insert into public.cases(id, case_code, status, urgency, lat, lng, landmark, province, incident_type, closed_at, is_demo, assigned_unit_id)
values ('d4400000-0000-0000-0000-000000000008', 'TF44-DEMO', 'UNREACHABLE', 'RED', 13.7, 100.5, 'TF44 demo', 'กรุงเทพมหานคร', 'FLOOD', now() - interval '91 days', true, 'c4400000-0000-0000-0000-000000000002');
update public.cases set assigned_unit_id='c4400000-0000-0000-0000-000000000001',
  resolved_at=now() - interval '91 days', close_confirmation='REPORTER_CONFIRMED', rescued_count=null,
  notes='TF44 private note 0812345678', resolution_note='TF44 private',
  urgency_override_reason='TF44 private', details='{"private":"TF44"}'::jsonb
where id='d4400000-0000-0000-0000-000000000001';
create temporary table tf44_original as select tracking_token from public.cases
where id='d4400000-0000-0000-0000-000000000001';

insert into public.case_contacts(case_id, name, phone, phone_last4, line_id, detailed_address, is_primary)
select id, 'TF44 name', '0812345678', '5678', 'tf44-line', 'TF44 address', true
from public.cases where case_code like 'TF44-%' and case_code not in ('TF44-HEALTH','TF44-MERGED','TF44-DEMO','TF44-PRIMARY-CLOSED','TF44-MERGED-WAIT','TF44-MERGED-OPEN');
insert into public.case_contacts(case_id, name, phone, phone_last4, line_id, detailed_address, is_primary)
values ('d4400000-0000-0000-0000-000000000001', 'TF44 other', '0899991111', '1111', 'tf44-other', 'TF44 other address', false);
insert into public.case_contacts(id, case_id, name, phone, phone_last4, line_id, detailed_address, is_primary)
values
  ('e4400000-0000-0000-0000-000000000001', 'd4400000-0000-0000-0000-000000000009', 'TF44 merged', '0899992222', '2222', 'tf44-merged', 'TF44 merged address', false),
  ('e4400000-0000-0000-0000-000000000002', 'd4400000-0000-0000-0000-000000000002', 'TF44 wait', '0899993333', '3333', 'tf44-wait', 'TF44 wait address', false),
  ('e4400000-0000-0000-0000-000000000003', 'd4400000-0000-0000-0000-000000000003', 'TF44 wait open', '0899994444', '4444', 'tf44-wait-open', 'TF44 wait open address', false);
insert into rls.case_merged_contacts(original_case_id, contact_id)
values
  ('d4400000-0000-0000-0000-000000000007', 'e4400000-0000-0000-0000-000000000001'),
  ('d4400000-0000-0000-0000-00000000000a', 'e4400000-0000-0000-0000-000000000002'),
  ('d4400000-0000-0000-0000-00000000000b', 'e4400000-0000-0000-0000-000000000003');
insert into public.case_sensitive_details(case_id, details)
values ('d4400000-0000-0000-0000-000000000001', '{"health":"TF44"}'),
       ('d4400000-0000-0000-0000-000000000002', '{"health":"TF44"}'),
       ('d4400000-0000-0000-0000-000000000006', '{"health":"TF44"}');
insert into public.case_needs(case_id, need, other_detail)
values ('d4400000-0000-0000-0000-000000000001','OTHER','TF44 private needs');
insert into public.case_events(case_id,event_type,to_status,note,metadata)
values ('d4400000-0000-0000-0000-000000000001','STATUS_CHANGED','AWAITING_CONFIRMATION','TF44 private event',
        '{"peopleHelped":3,"other":"TF44 private"}');
insert into public.case_events(case_id,event_type,note,metadata)
values ('d4400000-0000-0000-0000-000000000001','STATUS_CHANGED','TF44 invalid metadata',
        '{"peopleHelped":"0812345678"}');
insert into public.audit_logs(action,target_type,case_id,ip_address,user_agent,metadata)
values ('TF44_PRIVATE','case','d4400000-0000-0000-0000-000000000001','192.0.2.1','TF44 private', '{"note":"TF44 private"}');
insert into public.audit_logs(action,target_type,target_id,metadata)
values ('TF44_TARGET_ONLY','case','d4400000-0000-0000-0000-000000000001', '{"note":"TF44 private"}');
insert into public.case_media(id,case_id,storage_path,mime_type,file_size_bytes)
values ('f4400000-0000-0000-0000-000000000001','d4400000-0000-0000-0000-000000000001',
        'd4400000-0000-0000-0000-000000000001/photo.jpg','image/jpeg',10),
       ('f4400000-0000-0000-0000-000000000002','d4400000-0000-0000-0000-000000000009',
        'd4400000-0000-0000-0000-000000000007/photo.jpg','image/jpeg',10),
       ('f4400000-0000-0000-0000-000000000003','d4400000-0000-0000-0000-000000000002',
        'd4400000-0000-0000-0000-00000000000a/photo.jpg','image/jpeg',10),
       ('f4400000-0000-0000-0000-000000000004','d4400000-0000-0000-0000-000000000003',
        'd4400000-0000-0000-0000-00000000000b/photo.jpg','image/jpeg',10),
       ('f4400000-0000-0000-0000-000000000005','d4400000-0000-0000-0000-000000000003',
        'd4400000-0000-0000-0000-000000000003/photo.jpg','image/jpeg',10);

select has_function('public', 'purge_closed_case_pii', array[]::text[], 'มีฟังก์ชันลบข้อมูลส่วนตัว');
select ok(not has_function_privilege('anon', 'public.purge_closed_case_pii()', 'execute'), 'ผู้ไม่ล็อกอินเรียกไม่ได้');
select ok(not has_function_privilege('authenticated', 'public.purge_closed_case_pii()', 'execute'), 'ผู้ใช้ทั่วไปเรียกไม่ได้');
select ok(has_function_privilege('service_role', 'public.purge_closed_case_pii()', 'execute'), 'service_role เรียกได้');
select is((select sum(helped)::int from rls.unit_case_outcomes where unit_id='c4400000-0000-0000-0000-000000000001'), 1, 'ก่อนล้าง สถิตินับผลงานเคสเก่า');
select is((select sum(people_helped)::int from rls.unit_case_outcomes where unit_id='c4400000-0000-0000-0000-000000000001'), 3, 'ก่อนล้าง สถิติอ่านจำนวนผู้ช่วยเหลือจากประวัติ');
select throws_ok($$select public.run_case_retention_scheduled()$$, 'P0001', 'retention media worker is not configured', 'ไม่ล้างอัตโนมัติถ้ายังไม่ได้ตั้งค่า worker');
select ok((select pii_redacted_at is null and lat is not null from public.cases where id='d4400000-0000-0000-0000-000000000001'), 'เมื่อไม่ตั้งค่า worker เคสเก่ายังไม่ถูกล้างบางส่วน');
select is(public.purge_closed_case_pii(), 6, 'ล้างเคสเก่า รวมเคสที่มีแต่ข้อมูลสุขภาพและเคสที่ถูกรวม');
select is((select count(*)::int from public.case_contacts where case_id='d4400000-0000-0000-0000-000000000001' and name is null and phone is null and phone_last4 is null and line_id is null and detailed_address is null and redacted_at is not null), 2, 'ล้างข้อมูลผู้ติดต่อทุกคน');
select is((select count(*)::int from public.case_sensitive_details where case_id in ('d4400000-0000-0000-0000-000000000001','d4400000-0000-0000-0000-000000000006')), 0, 'ลบข้อมูลสุขภาพของเคสเก่า');
select ok((select name is null and phone is null and phone_last4 is null and line_id is null and detailed_address is null and redacted_at is not null from public.case_contacts where id='e4400000-0000-0000-0000-000000000001'), 'ล้างผู้ติดต่อของเคสเก่าที่ถูกย้ายไปรวมกับเคสหลักที่ปิดครบกำหนดแล้ว');
select is((select count(*)::int from public.case_contacts where case_id in ('d4400000-0000-0000-0000-000000000002','d4400000-0000-0000-0000-000000000003','d4400000-0000-0000-0000-000000000004','d4400000-0000-0000-0000-000000000005') and name='TF44 name' and phone='0812345678' and redacted_at is null), 4, 'ไม่ล้างเคสใหม่ เคสเปิด เคสครบ 90 วันพอดี หรือเคสไม่มีเวลาปิด');
select is((select count(*)::int from public.case_contacts where id in ('e4400000-0000-0000-0000-000000000002','e4400000-0000-0000-0000-000000000003') and name is null and phone is null and phone_last4 is null and line_id is null and detailed_address is null and redacted_at is not null), 2, 'ล้างผู้ติดต่อจากเคสซ้ำที่ครบกำหนด แม้เคสหลักยังเปิดหรือเพิ่งปิด');
select is((select count(*)::int from public.case_sensitive_details where case_id='d4400000-0000-0000-0000-000000000002'), 1, 'ไม่ลบข้อมูลสุขภาพของเคสใหม่');
select ok((select lat is null and lng is null and location is null and accuracy_m is null from public.cases where id='d4400000-0000-0000-0000-000000000001'), 'ล้างพิกัดละเอียดของเคสเก่า');
select ok((select landmark='[ลบข้อมูลส่วนบุคคลแล้ว]' and notes is null and resolution_note is null and urgency_override_reason is null and details='{}'::jsonb and reporter_user_id is null and cardinality(triage_reasons)=0 from public.cases where id='d4400000-0000-0000-0000-000000000001'), 'ล้างข้อความอิสระและข้อมูลเชื่อมผู้แจ้ง');
select ok((select tracking_token <> (select tracking_token from tf44_original) and pii_redacted_at is not null from public.cases where id='d4400000-0000-0000-0000-000000000001'), 'ยกเลิกลิงก์ติดตามเดิมและบันทึกเวลาล้าง');
select ok((select case_code like 'ANON-%' from public.cases where id='d4400000-0000-0000-0000-000000000001'), 'ยกเลิกรหัสเคสเดิมที่อาจเชื่อมถึงผู้แจ้ง');
select ok((select lat is not null and lng is not null and landmark='TF44' and pii_redacted_at is null from public.cases where case_code='TF44-RECENT'), 'ไม่ล้างพิกัดหรือจุดสังเกตของเคสใหม่');
select ok((select lat is not null and landmark='TF44 demo' and pii_redacted_at is null from public.cases where case_code='TF44-DEMO'), 'ไม่แก้ข้อมูล seed ของหน่วยตัวอย่าง');
select is((select other_detail from public.case_needs where case_id='d4400000-0000-0000-0000-000000000001' and need='OTHER'), '[ลบข้อมูลส่วนบุคคลแล้ว]', 'ล้างข้อความความต้องการอิสระ');
select is((select count(*)::int from public.case_events where case_id='d4400000-0000-0000-0000-000000000001' and note is null and metadata='{"peopleHelped":3}'::jsonb), 1, 'ล้างข้อมูลในประวัติโดยเก็บจำนวนผู้ช่วยเหลือ');
select is((select count(*)::int from public.case_events where case_id='d4400000-0000-0000-0000-000000000001' and note is null and metadata='{}'::jsonb), 1, 'ไม่เก็บข้อมูลส่วนตัวที่ปลอมเป็นจำนวนผู้ช่วยเหลือ');
select ok((select metadata='{}'::jsonb and ip_address is null and user_agent is null from public.audit_logs where action='TF44_PRIVATE'), 'ล้างข้อมูลส่วนตัวใน audit เก่าโดยเก็บเหตุการณ์');
select ok((select metadata='{}'::jsonb from public.audit_logs where action='TF44_TARGET_ONLY'), 'ล้าง audit ที่อ้างเคสผ่าน target_id');
select throws_ok($$update public.audit_logs set action='tampered' where action='TF44_PRIVATE'$$, '42501', null, 'ยังห้ามแก้ audit ทั่วไป');
select throws_ok($$update public.case_events set note='tampered' where case_id='d4400000-0000-0000-0000-000000000001'$$, '42501', null, 'ยังห้ามแก้ประวัติเคสทั่วไป');
select is((select count(*)::int from public.case_media where id in ('f4400000-0000-0000-0000-000000000001','f4400000-0000-0000-0000-000000000002')), 0, 'ซ่อนรูปเคสเก่ารวมรูปที่ถูกย้ายจากเคสซ้ำ');
select is((select count(*)::int from rls.case_media_deletion_queue where id in ('f4400000-0000-0000-0000-000000000003','f4400000-0000-0000-0000-000000000004')), 2, 'นำรูปจากเคสซ้ำที่ครบกำหนดเข้าคิวลบ แม้เคสหลักยังเปิดหรือเพิ่งปิด');
select ok(exists(select 1 from public.case_media where id='f4400000-0000-0000-0000-000000000005') and not exists(select 1 from rls.case_media_deletion_queue where id='f4400000-0000-0000-0000-000000000005'), 'เก็บรูปเดิมของเคสหลักที่ยังเปิด');
select is((select count(*)::int from rls.case_media_deletion_queue where case_id in ('d4400000-0000-0000-0000-000000000001','d4400000-0000-0000-0000-000000000007')), 2, 'คิวลบรูปจริงจาก Storage มีครบและลองซ้ำได้');
select ok(not has_table_privilege('authenticated','rls.case_media_deletion_queue','select'), 'ผู้ใช้ทั่วไปอ่านคิวลบรูปไม่ได้');
select ok(not has_table_privilege('authenticated','rls.case_pii_redaction_scope','insert'), 'ผู้ใช้ทั่วไปอนุญาตแก้ audit เองไม่ได้');
select throws_ok($$select public.run_case_media_retention_worker()$$, 'P0001', 'retention media worker is not configured', 'มีคิวค้างแต่ไม่ได้ตั้งค่า worker ต้องแจ้งข้อผิดพลาด');
select ok(not has_function_privilege('authenticated','public.claim_case_media_deletions(integer)','execute'), 'ผู้ใช้ทั่วไปเรียกงานลบรูปไม่ได้');
create temporary table tf44_claimed as select * from public.claim_case_media_deletions(10);
select is((select count(*)::int from tf44_claimed), 4, 'worker รับคิวลบรูปทั้งสี่รายการ');
select is((select count(*)::int from public.claim_case_media_deletions(10)), 0, 'worker อื่นรับคิวที่ติด lease ซ้ำไม่ได้');
select is(public.finish_case_media_deletion((select id from tf44_claimed limit 1), '00000000-0000-0000-0000-000000000001', true), false, 'lease ผิดยืนยันลบรูปไม่ได้');
select is(public.finish_case_media_deletion((select id from tf44_claimed order by id limit 1), (select lease_id from tf44_claimed order by id limit 1), false), true, 'เมื่อ Storage ล้มเหลวปล่อยคิวไว้ให้ลองใหม่');
create temporary table tf44_reclaimed as select * from public.claim_case_media_deletions(10);
select is((select count(*)::int from tf44_reclaimed), 1, 'คิวที่ล้มเหลวถูกรับซ้ำได้');
select is(public.finish_case_media_deletion((select id from tf44_reclaimed), (select lease_id from tf44_reclaimed), true), true, 'ยืนยันหลังลบไฟล์สำเร็จ');
select is(public.finish_case_media_deletion((select id from tf44_claimed order by id desc limit 1), (select lease_id from tf44_claimed order by id desc limit 1), true), true, 'ยืนยันอีกรายการหลังลบไฟล์สำเร็จ');
do $$ declare v_claim record; begin
  for v_claim in select * from tf44_claimed order by id offset 1 limit 2 loop
    perform public.finish_case_media_deletion(v_claim.id, v_claim.lease_id, true);
  end loop;
end $$;
select is((select count(*)::int from rls.case_media_deletion_queue), 0, 'คิวหมดเมื่อ Storage ยืนยันลบครบ');
select is((select count(*)::int from public.audit_logs where action='CASE_MEDIA_PURGED'), 4, 'บันทึก audit หลัง Storage ยืนยันลบไฟล์จริง');
select is(public.get_case_tracking('TF44-OLD', '5678', null, null), null::jsonb, 'เคสเก่าติดตามด้วยเลขท้ายที่ล้างแล้วไม่ได้');
select is(public.get_case_tracking('TF44-OLD', null, (select tracking_token from tf44_original), null), null::jsonb, 'ลิงก์ติดตามเดิมใช้ไม่ได้หลังล้าง');
select is(public.get_case_tracking('TF44-MERGED', '2222', null, null), null::jsonb, 'เคสถูกรวมติดตามด้วยเลขท้ายที่ล้างแล้วไม่ได้');
select is((select sum(helped)::int from rls.unit_case_outcomes where unit_id='c4400000-0000-0000-0000-000000000001'), 1, 'หลังล้าง view สถิติยังนับผลงานเคสเก่า');
select is((select sum(people_helped)::int from rls.unit_case_outcomes where unit_id='c4400000-0000-0000-0000-000000000001'), 3, 'หลังล้าง view สถิติยังนับจำนวนผู้ช่วยเหลือ');
select is((select count(*)::int from public.cases where id::text like 'd4400000-0000-0000-0000-%'), 11, 'เก็บเคสไว้สำหรับสถิติ');
select is((select count(*)::int from public.cases where id::text like 'd4400000-0000-0000-0000-%' and status='RESOLVED'), 3, 'สถานะที่ใช้ในสถิติไม่เปลี่ยน');
select is((select count(*)::int from public.cases where id::text like 'd4400000-0000-0000-0000-%' and urgency='GREEN'), 4, 'ระดับความเร่งด่วนไม่เปลี่ยน');
select is((select count(*)::int from public.audit_logs where action='CASE_PII_PURGED'), 1, 'บันทึก audit หนึ่งรายการต่อรอบที่ล้าง');
select is((select (metadata->>'cases')::int from public.audit_logs where action='CASE_PII_PURGED'), 6, 'audit บันทึกจำนวนเคส');
select is((select (metadata->>'contacts')::int from public.audit_logs where action='CASE_PII_PURGED'), 5, 'audit บันทึกจำนวนผู้ติดต่อ');
select ok(not exists(select 1 from public.audit_logs where action='CASE_PII_PURGED' and metadata::text like '%0812345678%'), 'audit ไม่มีเบอร์โทร');
select is(public.purge_closed_case_pii(), 0, 'รันซ้ำไม่ล้างซ้ำ');
select is((select count(*)::int from public.audit_logs where action='CASE_PII_PURGED'), 1, 'รอบที่ไม่ล้างไม่สร้าง audit ซ้ำ');
select is((select count(*)::int from cron.job where jobname='tf44-case-pii-retention' and schedule='10 19 * * *'), 1, 'ตั้งงานเวลา 02:10 น. ของไทยเมื่อ pg_cron ใช้ UTC');
select is((select count(*)::int from cron.job where jobname='tf44-case-pii-retention-backlog' and schedule='*/5 19-22 * * *'), 1, 'มีงานเก็บเคสตกค้างในช่วงกลางคืน');
select is((select command from cron.job where jobname='tf44-case-pii-retention'), 'select public.run_case_retention_scheduled()', 'cron ตรวจการตั้งค่า worker ก่อนล้าง');

-- เมื่อเคสหลักปิดเกิน 90 วันภายหลัง ให้ล้างข้อมูลของเคสหลักเอง
update public.cases set closed_at = now() - interval '91 days' where id = 'd4400000-0000-0000-0000-000000000002';
select is(public.purge_closed_case_pii(), 1, 'ล้างเคสหลักเมื่อปิดครบกำหนด');
select ok((select name is null and redacted_at is not null from public.case_contacts where id='e4400000-0000-0000-0000-000000000002'), 'ผู้ติดต่อจากเคสซ้ำยังถูกล้างอยู่');
select ok(not exists(select 1 from public.case_media where id='f4400000-0000-0000-0000-000000000003'), 'รูปจากเคสซ้ำถูกล้างไปแล้ว');

-- ทดสอบเพดาน retry ของคิวลบรูป (สูงสุด 10 ครั้ง)
insert into rls.case_media_deletion_queue(id, case_id, storage_path)
values ('f4400000-0000-0000-0000-000000000003', 'd4400000-0000-0000-0000-000000000002', 'retry/test.jpg');
do $$
declare
  v_claim record;
  i integer;
begin
  for i in 1..9 loop
    select * into v_claim from public.claim_case_media_deletions(1);
    perform public.finish_case_media_deletion(v_claim.id, v_claim.lease_id, false);
  end loop;
end $$;
select is((select count(*)::int from rls.case_media_deletion_queue where id='f4400000-0000-0000-0000-000000000003' and failed_at is null and attempts = 9), 1, 'ล้มเหลว 9 ครั้งยังรับคิวลองใหม่ได้');
do $$
declare v_claim record;
begin
  select * into v_claim from public.claim_case_media_deletions(1);
  perform public.finish_case_media_deletion(v_claim.id, v_claim.lease_id, false);
end $$;
select is((select count(*)::int from public.claim_case_media_deletions(10)), 0, 'ครบ 10 ครั้งแล้วไม่หยิบซ้ำไม่รู้จบ');
select ok((select failed_at is not null and attempts = 10 from rls.case_media_deletion_queue where id='f4400000-0000-0000-0000-000000000003'), 'ทำเครื่องหมายคิวที่ครบเพดานเป็น failed_at');
select is((select count(*)::int from public.audit_logs where action='CASE_MEDIA_PURGE_FAILED' and case_id='d4400000-0000-0000-0000-000000000002'), 1, 'บันทึก audit เมื่อคิวลบรูปครบเพดาน retry');

insert into rls.case_media_deletion_queue(id, case_id, storage_path, attempts, locked_until)
values ('f4400000-0000-0000-0000-000000000099', 'd4400000-0000-0000-0000-000000000007', 'd4400000-0000-0000-0000-000000000007/crashed.jpg', 10, now() - interval '1 minute');
select is((select count(*)::int from public.claim_case_media_deletions(10)), 0, 'กรณี worker ค้างรอบที่ 10 หลังหมด lease จะปิดงานค้างโดยไม่รับซ้ำ');
select ok((select failed_at is not null from rls.case_media_deletion_queue where id='f4400000-0000-0000-0000-000000000099'), 'ปิดงานรอบที่ 10 ที่ lease หมดอายุเป็น failed_at');
select is((select count(*)::int from public.audit_logs where action='CASE_MEDIA_PURGE_FAILED'), 2, 'บันทึก audit เพิ่มสำหรับงานที่หมดเพดานหลัง lease หมด');
select lives_ok($$select public.run_case_media_retention_worker()$$, 'เมื่อเหลือแต่คิวที่ failed_at ไม่ว่าง ไม่เรียก worker หรือแจ้ง error ซ้ำ');

insert into rls.case_media_deletion_queue(id, case_id, storage_path, attempts, created_at)
values
  ('f4400000-0000-0000-0000-0000000000a1', 'd4400000-0000-0000-0000-000000000007', 'd4400000-0000-0000-0000-000000000007/retry-first.jpg', 1, now() - interval '10 minutes'),
  ('f4400000-0000-0000-0000-0000000000a2', 'd4400000-0000-0000-0000-000000000007', 'd4400000-0000-0000-0000-000000000007/fresh-later.jpg', 0, now());
create temporary table tf44_priority as select * from public.claim_case_media_deletions(1);
select is((select id from tf44_priority), 'f4400000-0000-0000-0000-0000000000a2'::uuid, 'คิวใหม่ต้องได้สิทธิ์ก่อนรายการที่เคยล้มเหลว เพื่อไม่ให้คิวค้างขวางงานอื่น');
do $$ declare v_claim record; begin
  perform public.finish_case_media_deletion((select id from tf44_priority), (select lease_id from tf44_priority), true);
  select * into v_claim from public.claim_case_media_deletions(1);
  perform public.finish_case_media_deletion(v_claim.id, v_claim.lease_id, true);
end $$;

insert into public.cases(case_code, status, urgency, lat, lng, landmark, province, incident_type, closed_at)
select 'TF44-BATCH-' || g, 'CANCELLED', 'GREEN', 13.7, 100.5, 'TF44 batch', 'กรุงเทพมหานคร', 'FLOOD', now() - interval '100 days'
from generate_series(1, 101) g;
select is(public.purge_closed_case_pii(), 100, 'หนึ่งรอบล้างไม่เกิน 100 เคส');
select is((select count(*)::int from public.cases where landmark='[ลบข้อมูลส่วนบุคคลแล้ว]' and closed_at=now()-interval '100 days'), 100, 'เคสแรก 100 รายการถูกล้าง');
select is(public.purge_closed_case_pii(), 1, 'รอบถัดไปล้างเคสที่ค้าง');
select is((select count(*)::int from public.cases where landmark='[ลบข้อมูลส่วนบุคคลแล้ว]' and closed_at=now()-interval '100 days'), 101, 'ครบทั้ง 101 เคสหลังรันสองรอบ');
do $$ begin
  perform vault.create_secret('http://127.0.0.1:3000/api/retention/media', 'retention_worker_url');
  perform vault.create_secret('tf44-test-only-secret', 'retention_worker_secret');
end $$;
select is(public.run_case_retention_scheduled(), 0, 'งานตามเวลาเริ่มได้เมื่อตั้งค่า worker แล้วและไม่มีเคสค้าง');

select * from finish();
rollback;
