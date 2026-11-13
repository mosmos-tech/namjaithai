begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(27);
insert into auth.users(id) values ('a3500000-0000-0000-0000-000000000001'),('a3500000-0000-0000-0000-000000000002'),('a3500000-0000-0000-0000-000000000003');
insert into public.users(id,auth_user_id,display_name,role,status) values
 ('b3500000-0000-0000-0000-000000000001','a3500000-0000-0000-0000-000000000001','TF35 admin','ADMIN','ACTIVE'),
 ('b3500000-0000-0000-0000-000000000002','a3500000-0000-0000-0000-000000000002','TF35 rescuer','RESCUER','ACTIVE'),
 ('b3500000-0000-0000-0000-000000000003','a3500000-0000-0000-0000-000000000003','TF35 user','USER','ACTIVE');
update public.users set line_user_id = case id when 'b3500000-0000-0000-0000-000000000001'::uuid then 'U'||repeat('1',32) when 'b3500000-0000-0000-0000-000000000002'::uuid then 'U'||repeat('2',32) else null end where id in ('b3500000-0000-0000-0000-000000000001','b3500000-0000-0000-0000-000000000002');
insert into public.units(id,name,province) values('c3500000-0000-0000-0000-000000000001','TF35 unit','ตราด');
insert into public.units(id,name,province,source) values('c3500000-0000-0000-0000-000000000002','TF35 demo','ตราด','DEMO');
insert into public.unit_members(unit_id,user_id,role_in_unit,status) values('c3500000-0000-0000-0000-000000000001','b3500000-0000-0000-0000-000000000002','MEMBER','APPROVED');
insert into public.cases(id,case_code,urgency,status,lat,lng,landmark,province,incident_type,assigned_unit_id,assigned_rescuer_id,last_status_updated_at) values
 ('d3500000-0000-0000-0000-000000000001','TF35-RED','RED','NEW',12.24,102.51,'วัด','ตราด','FLOOD',null,null,now()-interval '10 minutes'),
 ('d3500000-0000-0000-0000-000000000002','TF35-YELLOW','YELLOW','NEW',12.24,102.51,'วัด','ตราด','FLOOD',null,null,now()-interval '30 minutes'),
 ('d3500000-0000-0000-0000-000000000003','TF35-EARLY','RED','NEW',12.24,102.51,'วัด','ตราด','FLOOD',null,null,now()-interval '9 minutes'),
 ('d3500000-0000-0000-0000-000000000004','TF35-WARN','RED','ACCEPTED',12.24,102.51,'วัด','ตราด','FLOOD','c3500000-0000-0000-0000-000000000001','b3500000-0000-0000-0000-000000000002',now()-interval '16 minutes'),
 ('d3500000-0000-0000-0000-000000000005','TF35-RELEASE','RED','EN_ROUTE',12.24,102.51,'วัด','ตราด','FLOOD','c3500000-0000-0000-0000-000000000001','b3500000-0000-0000-0000-000000000002',now()-interval '21 minutes'),
 ('d3500000-0000-0000-0000-000000000006','TF35-NOTE','YELLOW','ACCEPTED',12.24,102.51,'วัด','ตราด','FLOOD','c3500000-0000-0000-0000-000000000001','b3500000-0000-0000-0000-000000000002',now()-interval '21 minutes'),
 ('d3500000-0000-0000-0000-000000000007','TF35-SITE','YELLOW','ON_SITE',12.24,102.51,'วัด','ตราด','FLOOD','c3500000-0000-0000-0000-000000000001','b3500000-0000-0000-0000-000000000002',now()-interval '21 minutes');
insert into public.cases(id,case_code,urgency,status,lat,lng,landmark,province,incident_type,assigned_unit_id,is_demo,last_status_updated_at)
 values('d3500000-0000-0000-0000-000000000008','TF35-DEMO','RED','NEW',12.24,102.51,'วัด','ตราด','FLOOD','c3500000-0000-0000-0000-000000000002',true,now()-interval '40 minutes');
insert into public.cases(id,case_code,urgency,status,lat,lng,landmark,province,incident_type,assigned_unit_id,assigned_rescuer_id,last_status_updated_at)
 values('d3500000-0000-0000-0000-000000000009','TF35-REASSIGNED','YELLOW','EN_ROUTE',12.24,102.51,'วัด','ตราด','FLOOD','c3500000-0000-0000-0000-000000000001','b3500000-0000-0000-0000-000000000002',now()-interval '21 minutes');
insert into public.case_events(case_id,event_type,from_status,to_status,actor_user_id,actor_unit_id,actor_role)
 values('d3500000-0000-0000-0000-000000000009','ASSIGNED','EN_ROUTE','EN_ROUTE','b3500000-0000-0000-0000-000000000001','c3500000-0000-0000-0000-000000000001','UNIT_LEAD');
insert into public.case_events(case_id,event_type,from_status,to_status,actor_user_id,actor_unit_id,actor_role,note)
 values('d3500000-0000-0000-0000-000000000006','NOTE_ADDED','ACCEPTED','ACCEPTED','b3500000-0000-0000-0000-000000000002','c3500000-0000-0000-0000-000000000001','RESCUER','ยังดำเนินการ');
select ok(not has_function_privilege('authenticated','public.tf35_escalate_stale_cases()','EXECUTE'),'users cannot run worker');
select lives_ok('select public.tf35_escalate_stale_cases()','worker succeeds');
select is((select count(*) from public.case_stale_alerts where case_id='d3500000-0000-0000-0000-000000000001'),1::bigint,'red alerts after ten minutes');
select is((select count(*) from public.case_stale_alerts where case_id='d3500000-0000-0000-0000-000000000002'),1::bigint,'yellow alerts after thirty minutes');
select is((select count(*) from public.case_stale_alerts where case_id='d3500000-0000-0000-0000-000000000003'),0::bigint,'early case not alerted');
select is((select count(*) from public.case_stale_alerts where case_id='d3500000-0000-0000-0000-000000000004'),1::bigint,'team warned after fifteen minutes');
select is((select count(*) from public.case_line_notifications where case_id='d3500000-0000-0000-0000-000000000001' and kind='STALE_UNCLAIMED' and user_id='b3500000-0000-0000-0000-000000000001'),1::bigint,'admin LINE notification queued');
select is((select count(*) from public.case_line_notifications where case_id='d3500000-0000-0000-0000-000000000004' and kind='STALE_TEAM' and user_id='b3500000-0000-0000-0000-000000000002'),1::bigint,'rescuer LINE warning queued');
select is((select status::text from public.cases where id='d3500000-0000-0000-0000-000000000004'),'ACCEPTED','not released before twenty minutes');
select is((select status::text from public.cases where id='d3500000-0000-0000-0000-000000000005'),'NEW','silent en route returned to new');
select is((select status::text from public.cases where id='d3500000-0000-0000-0000-000000000007'),'NEW','silent on site returned to new');
select is((select status::text from public.cases where id='d3500000-0000-0000-0000-000000000006'),'ACCEPTED','recent note prevents release');
select is((select status::text from public.cases where id='d3500000-0000-0000-0000-000000000009'),'EN_ROUTE','recent reassignment prevents release');
select is((select assigned_rescuer_id from public.cases where id='d3500000-0000-0000-0000-000000000005'),null::uuid,'released assignment cleared');
select is((select count(*) from public.case_events where case_id='d3500000-0000-0000-0000-000000000005' and event_type='AUTO_ESCALATED'),1::bigint,'release recorded');
select is((select count(*) from public.case_stale_alerts where case_id='d3500000-0000-0000-0000-000000000008'),0::bigint,'demo case never alerted');
select ok(not has_function_privilege('anon','public.tf35_stale_alerts()','EXECUTE'),'anonymous cannot access alerts');
select lives_ok('select public.tf35_escalate_stale_cases()','worker may run again');
select is((select count(*) from public.case_stale_alerts where case_id='d3500000-0000-0000-0000-000000000001'),1::bigint,'repeated worker does not spam');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a3500000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select ok(exists(select 1 from public.tf35_stale_alerts() where case_code='TF35-RED'),'admin sees unclaimed alert');
select set_config('request.jwt.claims','{"sub":"a3500000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select ok(exists(select 1 from public.tf35_stale_alerts() where case_code='TF35-WARN'),'assigned rescuer sees team alert');
reset role;
update public.users set role='USER' where id='b3500000-0000-0000-0000-000000000002';
set local role authenticated;
select is((select count(*) from public.tf35_stale_alerts()),0::bigint,'demoted rescuer cannot see alerts');
reset role;
update public.users set role='RESCUER' where id='b3500000-0000-0000-0000-000000000002';
update public.unit_members set status='SUSPENDED' where user_id='b3500000-0000-0000-0000-000000000002';
set local role authenticated;
select is((select count(*) from public.tf35_stale_alerts()),0::bigint,'suspended membership cannot see alerts');
select set_config('request.jwt.claims','{"sub":"a3500000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select is((select count(*) from public.tf35_stale_alerts()),0::bigint,'unrelated user cannot see alerts');
reset role;
update public.cases set status='ACCEPTED',assigned_unit_id='c3500000-0000-0000-0000-000000000001',assigned_rescuer_id='b3500000-0000-0000-0000-000000000002',last_status_updated_at=now() where id='d3500000-0000-0000-0000-000000000001';
set local role service_role;
select lives_ok('select public.claim_case_line_notifications()','LINE worker can claim notifications');
reset role;
select is((select state from public.case_line_notifications where case_id='d3500000-0000-0000-0000-000000000004' and kind='STALE_TEAM' and user_id='b3500000-0000-0000-0000-000000000002'),'SKIPPED','revoked membership suppresses LINE delivery');
select is((select state from public.case_line_notifications where case_id='d3500000-0000-0000-0000-000000000001' and kind='STALE_UNCLAIMED' and user_id='b3500000-0000-0000-0000-000000000001'),'SKIPPED','resolved stale alert not sent');
select * from finish();
rollback;
