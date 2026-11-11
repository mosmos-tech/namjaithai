begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(18);
insert into auth.users(id) values ('a5800000-0000-0000-0000-000000000001'),('a5800000-0000-0000-0000-000000000002');
insert into public.users(id,auth_user_id,display_name,role,status) values
 ('b5800000-0000-0000-0000-000000000001','a5800000-0000-0000-0000-000000000001','TF58 lead','UNIT_LEAD','ACTIVE'),
 ('b5800000-0000-0000-0000-000000000002','a5800000-0000-0000-0000-000000000002','TF58 user','USER','ACTIVE');
insert into public.units(id,name,province) values ('c5800000-0000-0000-0000-000000000001','TF58 unit','ตราด');
insert into public.unit_members(unit_id,user_id,role_in_unit,status) values ('c5800000-0000-0000-0000-000000000001','b5800000-0000-0000-0000-000000000001','LEAD','APPROVED');
insert into public.cases(id,case_code,tracking_token,urgency,status,lat,lng,landmark,province,incident_type,assigned_unit_id,last_status_updated_at) values
 ('d5800000-0000-0000-0000-000000000001','TF58-CONFIRM','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','RED','AWAITING_CONFIRMATION',12.24,102.51,'วัด','ตราด','FLOOD','c5800000-0000-0000-0000-000000000001',now()),
 ('d5800000-0000-0000-0000-000000000002','TF58-REOPEN','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','YELLOW','AWAITING_CONFIRMATION',12.24,102.51,'วัด','ตราด','FLOOD','c5800000-0000-0000-0000-000000000001',now()),
 ('d5800000-0000-0000-0000-000000000003','TF58-OVERDUE','cccccccccccccccccccccccccccccccc','GREEN','AWAITING_CONFIRMATION',12.24,102.51,'วัด','ตราด','FLOOD','c5800000-0000-0000-0000-000000000001',now()-interval '25 hours'),
 ('d5800000-0000-0000-0000-000000000004','TF58-EARLY','dddddddddddddddddddddddddddddddd','GREEN','AWAITING_CONFIRMATION',12.24,102.51,'วัด','ตราด','FLOOD','c5800000-0000-0000-0000-000000000001',now());
update rls.case_confirmation_secrets set secret=case case_id when 'd5800000-0000-0000-0000-000000000001'::uuid then repeat('1',32) when 'd5800000-0000-0000-0000-000000000002'::uuid then repeat('2',32) else secret end where case_id in ('d5800000-0000-0000-0000-000000000001','d5800000-0000-0000-0000-000000000002');
select ok(not public.case_status_transition_allowed('ON_SITE','RESOLVED',false,false,true),'on-site cannot close directly');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a5800000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.lead_confirmation_queue()$$,'42501',null,'ordinary user cannot access lead queue');
select throws_ok($$select public.lead_confirm_unverified('d5800000-0000-0000-0000-000000000003')$$,'42501',null,'ordinary user cannot close');
select ok(not has_function_privilege('authenticated','public.reporter_confirm_case(text,text,text)','EXECUTE'),'reporter RPC not exposed to authenticated');
reset role;
set local role service_role;
select throws_ok($$select public.reporter_confirm_case('TF58-CONFIRM','bad','CONFIRM')$$,'42501',null,'wrong token denied');
select throws_ok($$select public.reporter_confirm_case('TF58-CONFIRM','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','CONFIRM')$$,'42501',null,'tracking token cannot confirm');
select is(public.reporter_confirm_case('TF58-CONFIRM','11111111111111111111111111111111','CONFIRM')->>'status','RESOLVED','reporter confirms');
select is(public.reporter_confirm_case('TF58-CONFIRM','11111111111111111111111111111111','CONFIRM')->>'status','STALE','repeated confirmation is stale');
select is(public.reporter_confirm_case('TF58-REOPEN','22222222222222222222222222222222','NOT_RECEIVED')->>'status','NEW','rejection reopens');
reset role;
select is((select close_confirmation from public.cases where case_code='TF58-CONFIRM'),'REPORTER_CONFIRMED','reporter closure recorded distinctly');
select is((select count(*) from public.case_lead_alerts where case_id='d5800000-0000-0000-0000-000000000002'),1::bigint,'reopened case alerts previous lead');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a5800000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select is(jsonb_array_length(public.lead_confirmation_queue()),2,'lead sees overdue and reopen alert');
select throws_ok($$select public.lead_confirm_unverified('d5800000-0000-0000-0000-000000000004')$$,'22023',null,'lead cannot close before 24 hours');
select ok(not has_function_privilege('anon','public.reporter_confirm_case(text,text,text)','EXECUTE'),'anonymous callers cannot invoke service RPC');
select throws_ok($$select public.lead_confirm_unverified('d5800000-0000-0000-0000-000000000002')$$,'42501',null,'lead cannot close reassigned case');
select lives_ok($$select public.lead_confirm_unverified('d5800000-0000-0000-0000-000000000003')$$,'lead may close after 24 hours');
reset role;
select is((select close_confirmation from public.cases where case_code='TF58-OVERDUE'),'LEAD_UNCONFIRMED','unconfirmed closure distinguished');
select ok(exists(select 1 from public.audit_logs where case_id='d5800000-0000-0000-0000-000000000003' and action='CLOSE_UNCONFIRMED'),'lead closure audited');
select * from finish();
rollback;
