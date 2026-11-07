begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(21);
insert into auth.users(id) values
 ('f4300000-0000-0000-0000-000000000001'), ('f4300000-0000-0000-0000-000000000002'), ('f4300000-0000-0000-0000-000000000003');
insert into public.users(id, auth_user_id, display_name, role, status, line_user_id) values
 ('f4300000-0000-0000-0000-000000000001','f4300000-0000-0000-0000-000000000001','TF43 A','USER','ACTIVE','U'||repeat('a',32)),
 ('f4300000-0000-0000-0000-000000000002','f4300000-0000-0000-0000-000000000002','TF43 B','USER','ACTIVE',null),
 ('f4300000-0000-0000-0000-000000000003','f4300000-0000-0000-0000-000000000003','TF43 admin','ADMIN','ACTIVE',null);
insert into public.cases(id, case_code, urgency, lat, lng, landmark, reporter_user_id) values
 ('f4310000-0000-0000-0000-000000000001','TF43-A','RED',13.76,100.53,'synthetic','f4300000-0000-0000-0000-000000000001'),
 ('f4310000-0000-0000-0000-000000000002','TF43-B','RED',13.76,100.53,'synthetic','f4300000-0000-0000-0000-000000000002'),
 ('f4310000-0000-0000-0000-000000000003','TF43-ADMIN','RED',13.76,100.53,'synthetic','f4300000-0000-0000-0000-000000000003'),
 ('f4310000-0000-0000-0000-000000000004','TF43-GUEST','RED',13.76,100.53,'synthetic',null);

set local role anon;
select throws_ok('select * from public.get_my_cases()', '42501', null, 'guest cannot enumerate account cases');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f4300000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select is((select string_agg(case_code,',') from public.get_my_cases()), 'TF43-A', 'A sees only own case, not B/admin/guest');
select is((select count(*)::int from public.get_my_cases(1)), 0, 'pagination offset applied to own cases only');
select throws_ok('select * from public.case_line_notifications','42501',null,'reporter cannot read notification recipients');
select throws_ok('select * from public.claim_case_line_notifications()','42501',null,'reporter cannot claim push jobs');
select set_config('request.jwt.claims','{"sub":"f4300000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select is((select string_agg(case_code,',') from public.get_my_cases()), 'TF43-B', 'B cannot enumerate A');
select set_config('request.jwt.claims','{"sub":"f4300000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select is((select string_agg(case_code,',') from public.get_my_cases()), 'TF43-ADMIN', 'my cases stays owner-only even for admin');
reset role;
update public.users set status='SUSPENDED' where id='f4300000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f4300000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select is((select count(*)::int from public.get_my_cases()), 0, 'inactive user cannot read account cases');
reset role;
update public.users set status='ACTIVE' where id='f4300000-0000-0000-0000-000000000001';
-- TF-34 เปิดคิวแจ้งสถานะแล้ว (เดิม #27 พักไว้รอ OA) — การส่งจริงคุมด้วยด่าน dev/uat ใน worker
select ok((select tgenabled <> 'D' from pg_trigger where tgname='trg_case_line_notification'),'status change queue is enabled since TF-34');
update public.cases set status='ACCEPTED' where case_code like 'TF43-%';
select is((select count(*)::int from public.case_line_notifications where case_id::text like 'f431%'),1,'queue only actual LINE recipients, not guest or missing LINE identity');
update public.cases set status='ACCEPTED' where case_code='TF43-A';
select is((select count(*)::int from public.case_line_notifications where case_id::text like 'f431%'),1,'same status does not duplicate jobs');
update public.cases set status='EN_ROUTE' where case_code='TF43-A';
create temporary table tf43_claims as select * from public.claim_case_line_notifications() where case_code='TF43-A';
select is((select count(*)::int from tf43_claims),1,'claim only first status per case to preserve message order');
select is((select to_status::text from tf43_claims),'ACCEPTED','oldest status is first');
select is((select count(*)::int from public.claim_case_line_notifications() where case_code='TF43-A'),0,'active lease excludes concurrent workers and later statuses');
select public.finish_case_line_notification(id, gen_random_uuid(), 'SENT') from tf43_claims;
select is((select state from public.case_line_notifications where id=(select id from tf43_claims)),'SENDING','wrong lease cannot acknowledge job');
select public.finish_case_line_notification(id, lease_id, 'SENT') from tf43_claims;
select is((select state from public.case_line_notifications where id=(select id from tf43_claims)),'SENT','matching lease acknowledges accepted push');
select is((select to_status::text from public.claim_case_line_notifications() where case_code='TF43-A'),'EN_ROUTE','next status becomes available after first accepted');
update public.users set status='SUSPENDED' where id='f4300000-0000-0000-0000-000000000001';
select public.claim_case_line_notifications();
select is((select count(*)::int from public.case_line_notifications where case_id::text like 'f431%' and state='FAILED'),1,'recipient suspension removes queued delivery access');
update public.users set status='ACTIVE' where id='f4300000-0000-0000-0000-000000000001';
update public.cases set status='ON_SITE' where case_code='TF43-A';
update public.case_line_notifications set attempts=4 where case_id='f4310000-0000-0000-0000-000000000001' and to_status='ON_SITE';
truncate tf43_claims;
insert into tf43_claims select * from public.claim_case_line_notifications() where case_code='TF43-A';
select public.finish_case_line_notification(id, lease_id, 'RETRY', 'network_error') from tf43_claims;
select is((select state from public.case_line_notifications where id=(select id from tf43_claims)),'FAILED','fifth failed attempt does not retry forever');
update public.cases set status='RESOLVED' where case_code='TF43-A';
update public.case_line_notifications set created_at=now()-interval '24 hours' where case_id='f4310000-0000-0000-0000-000000000001' and to_status='RESOLVED';
select is((select count(*)::int from public.claim_case_line_notifications() where case_code='TF43-A'),0,'expired retry keys are never reused for a new send');
select is((select state from public.case_line_notifications where case_id='f4310000-0000-0000-0000-000000000001' and to_status='RESOLVED'),'FAILED','old notifications are marked failed');
select * from finish();
rollback;
