begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(15);
insert into auth.users(id) values ('a3100000-0000-0000-0000-000000000001'), ('a3100000-0000-0000-0000-000000000002');
insert into public.users(id,auth_user_id,display_name,role,status) values
 ('b3100000-0000-0000-0000-000000000001','a3100000-0000-0000-0000-000000000001','TF31 admin','ADMIN','ACTIVE'),
 ('b3100000-0000-0000-0000-000000000002','a3100000-0000-0000-0000-000000000002','TF31 user','USER','ACTIVE');
insert into public.units(id,name,province) values ('c3100000-0000-0000-0000-000000000001','TF31 unit','ตราด');
insert into public.cases(id,case_code,urgency,lat,lng,landmark,province,incident_type) values
 ('d3100000-0000-0000-0000-000000000001','TF31-PRIMARY','RED',12.24,102.51,'วัด','ตราด','FLOOD'),
 ('d3100000-0000-0000-0000-000000000002','TF31-SECOND','YELLOW',12.24001,102.51,'วัด','ตราด','FLOOD'),
 ('d3100000-0000-0000-0000-000000000003','TF31-FAR','GREEN',13.24,102.51,'วัด','ตราด','FLOOD');
insert into public.case_contacts(id,case_id,phone_last4,is_primary) values
 ('e3100000-0000-0000-0000-000000000001','d3100000-0000-0000-0000-000000000002','1234',true);
insert into public.case_media(id,case_id,storage_path) values
 ('f3100000-0000-0000-0000-000000000001','d3100000-0000-0000-0000-000000000002','tf31/test.jpg');
select set_config('request.jwt.claims','{"sub":"a3100000-0000-0000-0000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$select public.admin_case_action('unreachable','d3100000-0000-0000-0000-000000000001',1,null,null,'ติดต่อไม่ได้')$$,'42501',null,'non-admin cannot close');
select throws_ok($$select public.admin_nearby_cases('d3100000-0000-0000-0000-000000000001')$$,'42501',null,'non-admin cannot see nearby');
select throws_ok($$select public.admin_reveal_case_contacts('d3100000-0000-0000-0000-000000000001')$$,'42501',null,'non-admin cannot reveal contacts');
select set_config('request.jwt.claims','{"sub":"a3100000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select is((select count(*) from public.admin_nearby_cases('d3100000-0000-0000-0000-000000000002')),1::bigint,'nearby limited to 50m');
select throws_ok($$select public.admin_case_action('unreachable','d3100000-0000-0000-0000-000000000001',1,null,null,' ')$$,'22023',null,'reason required');
select throws_ok($$select public.admin_case_action('merge','d3100000-0000-0000-0000-000000000002',1,null,'d3100000-0000-0000-0000-000000000003',null)$$,'22023',null,'cannot merge distant cases');
select lives_ok($$select public.admin_case_action('merge','d3100000-0000-0000-0000-000000000002',1,null,'d3100000-0000-0000-0000-000000000001',null)$$,'merge nearby');
reset role;
select is((select status::text from public.cases where case_code='TF31-SECOND'),'DUPLICATE','secondary closed as duplicate');
select is((select duplicate_of_case_id from public.cases where case_code='TF31-SECOND'),'d3100000-0000-0000-0000-000000000001'::uuid,'secondary points to primary');
select is((select case_id from public.case_contacts where id='e3100000-0000-0000-0000-000000000001'),'d3100000-0000-0000-0000-000000000001'::uuid,'contact moved');
select is((select case_id from public.case_media where id='f3100000-0000-0000-0000-000000000001'),'d3100000-0000-0000-0000-000000000001'::uuid,'photo moved');
select is((public.get_case_tracking('TF31-SECOND','1234',null,null)->>'status'),'DUPLICATE','secondary can still be tracked by phone');
select is(jsonb_array_length(public.admin_reveal_case_contacts('d3100000-0000-0000-0000-000000000001')),1,'admin can reveal moved contact');
select is((select count(*) from public.audit_logs where case_id='d3100000-0000-0000-0000-000000000001' and action='CASE_CONTACT_REVEALED'),1::bigint,'contact disclosure audited');
set local role authenticated;
select lives_ok($$select public.admin_case_action('unreachable','d3100000-0000-0000-0000-000000000001',1,null,null,'ติดต่อไม่ได้')$$,'admin closes with reason');
select * from finish();
rollback;
