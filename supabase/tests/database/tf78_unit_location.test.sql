begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(10);
insert into auth.users(id) values ('a7800000-0000-0000-0000-000000000001'),('a7800000-0000-0000-0000-000000000002'),('a7800000-0000-0000-0000-000000000003');
insert into public.users(id,auth_user_id,display_name,role,status) values
 ('b7800000-0000-0000-0000-000000000001','a7800000-0000-0000-0000-000000000001','TF78 lead','UNIT_LEAD','ACTIVE'),
 ('b7800000-0000-0000-0000-000000000002','a7800000-0000-0000-0000-000000000002','TF78 user','USER','ACTIVE'),
 ('b7800000-0000-0000-0000-000000000003','a7800000-0000-0000-0000-000000000003','TF78 admin','ADMIN','ACTIVE');
insert into public.units(id,name,province) values ('c7800000-0000-0000-0000-000000000001','TF78 own','ตราด'),('c7800000-0000-0000-0000-000000000002','TF78 other','ตราด');
insert into public.unit_members(unit_id,user_id,role_in_unit,status) values ('c7800000-0000-0000-0000-000000000001','b7800000-0000-0000-0000-000000000001','LEAD','APPROVED');
select ok(not has_function_privilege('anon','public.set_own_unit_location(uuid,double precision,double precision)','EXECUTE'),'anonymous cannot update');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a7800000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.set_own_unit_location('c7800000-0000-0000-0000-000000000001',13.75,100.5)$$,'42501',null,'ordinary user denied');
select set_config('request.jwt.claims','{"sub":"a7800000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.set_own_unit_location('c7800000-0000-0000-0000-000000000002',13.75,100.5)$$,'42501',null,'lead denied another unit');
select throws_ok($$select public.set_own_unit_location('c7800000-0000-0000-0000-000000000001',30,100.5)$$,'22023',null,'outside bounds denied');
select throws_ok($$select public.set_own_unit_location('c7800000-0000-0000-0000-000000000001',null,100.5)$$,'22023',null,'partial coordinates denied');
select lives_ok($$select public.set_own_unit_location('c7800000-0000-0000-0000-000000000001',13.75,100.5)$$,'lead sets own unit');
reset role;
select is((select location_lat from public.units where id='c7800000-0000-0000-0000-000000000001'),13.75::double precision,'latitude stored');
select ok(exists(select 1 from public.audit_logs where action='UNIT_LOCATION_CHANGED' and target_id='c7800000-0000-0000-0000-000000000001' and actor_user_id='b7800000-0000-0000-0000-000000000001'),'change audited');
update public.unit_members set status='SUSPENDED' where user_id='b7800000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok($$select public.set_own_unit_location('c7800000-0000-0000-0000-000000000001',13.75,100.5)$$,'42501',null,'suspended membership denied');
select set_config('request.jwt.claims','{"sub":"a7800000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select lives_ok($$select public.set_own_unit_location('c7800000-0000-0000-0000-000000000002',13.75,100.5)$$,'admin can set other unit');
reset role;
select * from finish();
rollback;
