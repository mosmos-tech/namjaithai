begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(14);
insert into auth.users(id) values ('a5890000-0000-0000-0000-000000000001'), ('a5890000-0000-0000-0000-000000000002');
insert into public.users(id,auth_user_id,display_name,role,status,line_user_id) values
 ('b5890000-0000-0000-0000-000000000001','a5890000-0000-0000-0000-000000000001','TF58 owner','USER','ACTIVE','U' || repeat('1',32)),
 ('b5890000-0000-0000-0000-000000000002','a5890000-0000-0000-0000-000000000002','TF58 other','USER','ACTIVE','U' || repeat('2',32));
insert into public.units(id,name,province) values ('c5890000-0000-0000-0000-000000000001','TF58 LINE unit','ภูเก็ต');
insert into public.cases(id,case_code,urgency,status,lat,lng,landmark,incident_type,reporter_user_id) values
 ('d5890000-0000-0000-0000-000000000001','TF58-LINE-ONE','YELLOW','AWAITING_CONFIRMATION',7.9,98.4,'TF58','FLOOD','b5890000-0000-0000-0000-000000000001'),
 ('d5890000-0000-0000-0000-000000000002','TF58-LINE-TWO','YELLOW','AWAITING_CONFIRMATION',7.9,98.4,'TF58','FLOOD','b5890000-0000-0000-0000-000000000001');
insert into public.cases(id,case_code,urgency,status,lat,lng,landmark,incident_type,reporter_user_id,assigned_unit_id) values ('d5890000-0000-0000-0000-000000000003','TF58-LINE-THREE','YELLOW','AWAITING_CONFIRMATION',7.9,98.4,'TF58','FLOOD','b5890000-0000-0000-0000-000000000001','c5890000-0000-0000-0000-000000000001');
select ok(not has_function_privilege('anon','public.confirm_case_as_reporter(text,text)','EXECUTE'),'anonymous cannot confirm via account');
select ok(not has_table_privilege('authenticated','rls.case_confirmation_secrets','SELECT'),'authenticated cannot read confirmation secrets');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a5890000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select is(public.can_confirm_case_as_reporter('TF58-LINE-ONE'),false,'another account is not owner');
select throws_ok($$select public.confirm_case_as_reporter('TF58-LINE-ONE','CONFIRM')$$,'42501',null,'another account cannot confirm');
select set_config('request.jwt.claims','{"sub":"a5890000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select is(public.can_confirm_case_as_reporter('TF58-LINE-ONE'),true,'owner account is recognized');
select is(public.confirm_case_as_reporter('TF58-LINE-ONE','CONFIRM')->>'status','RESOLVED','owner account confirms');
select is(public.confirm_case_as_reporter('TF58-LINE-ONE','CONFIRM')->>'status','STALE','repeat cannot change case');
select is(public.confirm_case_as_reporter('TF58-LINE-THREE','NOT_RECEIVED')->>'status','NEW','owner can reopen from account');
reset role;
select is((select close_confirmation from public.cases where id='d5890000-0000-0000-0000-000000000001'),'REPORTER_CONFIRMED','closure is recorded as confirmed');
select is((select actor_user_id from public.audit_logs where case_id='d5890000-0000-0000-0000-000000000001' and action='REPORTER_CONFIRMATION'),'b5890000-0000-0000-0000-000000000001'::uuid,'account confirmation records the verified actor');
select is((select status::text from public.cases where id='d5890000-0000-0000-0000-000000000003'),'NEW','account rejection returns case to NEW');
select is((select count(*) from public.case_lead_alerts where case_id='d5890000-0000-0000-0000-000000000003'),1::bigint,'account rejection alerts lead');
update public.users set status='SUSPENDED' where id='b5890000-0000-0000-0000-000000000001';
set local role authenticated;
select is(public.can_confirm_case_as_reporter('TF58-LINE-TWO'),false,'suspended owner cannot confirm');
select throws_ok($$select public.confirm_case_as_reporter('TF58-LINE-TWO','CONFIRM')$$,'42501',null,'suspended owner is denied');
select * from finish();
rollback;
