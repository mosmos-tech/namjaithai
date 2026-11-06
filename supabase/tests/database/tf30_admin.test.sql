begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(25);
select ok(not has_function_privilege('anon','public.admin_manage(text,jsonb)','execute'),'anon cannot invoke admin RPC');
insert into auth.users(id) values ('a3000000-0000-0000-0000-000000000001'),('a3000000-0000-0000-0000-000000000002'),('a3000000-0000-0000-0000-000000000003');
insert into public.users(id,auth_user_id,display_name,role,status) values
 ('b3000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','TF30 admin','ADMIN','ACTIVE'),
 ('b3000000-0000-0000-0000-000000000002','a3000000-0000-0000-0000-000000000002','TF30 user','USER','ACTIVE'),
 ('b3000000-0000-0000-0000-000000000003','a3000000-0000-0000-0000-000000000003','TF30 new leader','USER','ACTIVE');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a3000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.admin_manage('create_unit','{"name":"unauthorized","province":"กรุงเทพมหานคร"}')$$,'42501',null,'non-admin cannot create unit');
select throws_ok($$select public.admin_manage('user_status','{"userId":"b3000000-0000-0000-0000-000000000001","status":"SUSPENDED"}')$$,'42501',null,'non-admin cannot suspend');
select set_config('request.jwt.claims','{"sub":"a3000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.admin_manage('create_unit','{"name":"TF30 unit","province":"กรุงเทพมหานคร","leaderId":"b3000000-0000-0000-0000-000000000002"}')$$,'admin creates unit and assigns leader');
select is((select count(*)::int from public.units where name='TF30 unit' and lead_user_id='b3000000-0000-0000-0000-000000000002'),1,'unit stores leader');
select is((select count(*)::int from public.unit_members m join public.units u on u.id=m.unit_id where u.name='TF30 unit' and m.user_id='b3000000-0000-0000-0000-000000000002' and m.role_in_unit='LEAD' and m.status='APPROVED'),1,'leader has approved membership');
select is((select role::text from public.users where id='b3000000-0000-0000-0000-000000000002'),'UNIT_LEAD','leader has correct role');
select lives_ok(format($$select public.admin_manage('assign_leader',jsonb_build_object('unitId',%L,'userId','b3000000-0000-0000-0000-000000000003'))$$,(select id from public.units where name='TF30 unit')),'admin can replace leader');
select is((select role_in_unit from public.unit_members where unit_id=(select id from public.units where name='TF30 unit') and user_id='b3000000-0000-0000-0000-000000000002'),'MEMBER','previous leader loses unit lead membership');
select is((select role::text from public.users where id='b3000000-0000-0000-0000-000000000002'),'RESCUER','previous leader role is reduced immediately');
select lives_ok(format($$select public.admin_manage('capabilities',jsonb_build_object('unitId',%L,'capabilities',jsonb_build_array('BOAT','EMS')))$$,(select id from public.units where name='TF30 unit')),'admin sets capabilities');
select is((select count(*)::int from public.unit_capabilities where unit_id=(select id from public.units where name='TF30 unit')),2,'capabilities stored');
select throws_ok(format($$select public.admin_manage('capabilities',jsonb_build_object('unitId',%L,'capabilities',jsonb_build_array('INVALID')))$$,(select id from public.units where name='TF30 unit')),'22023',null,'unknown capability rejected');
select throws_ok(format($$select public.admin_manage('incident_type',jsonb_build_object('code',%L,'enabled',true))$$,code),'22023',null,'unfinished incident cannot be enabled: ' || code) from (values ('FIRE'),('ROAD_ACCIDENT'),('MEDICAL'),('WATER_RESCUE'),('COLLAPSE'),('ANIMAL'),('OTHER')) as unfinished(code);
select ok(not (select is_enabled from public.incident_types where code='FIRE'),'unfinished incident stays disabled');
select lives_ok($$select public.admin_manage('incident_type','{"code":"FLOOD","enabled":true}')$$,'ready flood incident can be enabled');
select throws_ok($$select public.admin_manage('user_status','{"userId":"b3000000-0000-0000-0000-000000000001","status":"SUSPENDED"}')$$,'42501',null,'admin cannot suspend own account');
select lives_ok($$select public.admin_manage('user_status','{"userId":"b3000000-0000-0000-0000-000000000002","status":"SUSPENDED"}')$$,'admin suspends user');
select set_config('request.jwt.claims','{"sub":"a3000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select is(rls.current_user_id(),null::uuid,'suspension immediately removes access on existing session');
select * from finish();
rollback;
