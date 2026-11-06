begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(11);
insert into auth.users(id) values ('a5200000-0000-0000-0000-000000000001'),('a5200000-0000-0000-0000-000000000002'),('a5200000-0000-0000-0000-000000000003'),('a5200000-0000-0000-0000-000000000004');
insert into public.users(id,auth_user_id,display_name,role,status) values
 ('b5200000-0000-0000-0000-000000000001','a5200000-0000-0000-0000-000000000001','admin','ADMIN','ACTIVE'),
 ('b5200000-0000-0000-0000-000000000002','a5200000-0000-0000-0000-000000000002','lead','UNIT_LEAD','ACTIVE'),
 ('b5200000-0000-0000-0000-000000000003','a5200000-0000-0000-0000-000000000003','member','RESCUER','ACTIVE'),
 ('b5200000-0000-0000-0000-000000000004','a5200000-0000-0000-0000-000000000004','expired','UNIT_LEAD','ACTIVE');
insert into public.units(id,name,province) values
 ('c5200000-0000-0000-0000-000000000001','TF52 A','กรุงเทพมหานคร'),
 ('c5200000-0000-0000-0000-000000000002','TF52 B','เชียงใหม่');
insert into public.unit_members(user_id,unit_id,role_in_unit,status,expires_at) values
 ('b5200000-0000-0000-0000-000000000002','c5200000-0000-0000-0000-000000000001','LEAD','APPROVED',null),
 ('b5200000-0000-0000-0000-000000000003','c5200000-0000-0000-0000-000000000001','MEMBER','APPROVED',null),
 ('b5200000-0000-0000-0000-000000000004','c5200000-0000-0000-0000-000000000001','LEAD','APPROVED',now()-interval '1 day');
insert into public.cases(case_code,urgency,lat,lng,landmark,province,incident_type)
  values ('TF52-RLS-FIRE','RED',13.76,100.53,'test','กรุงเทพมหานคร','FIRE');
select ok(not has_function_privilege('anon','public.set_unit_capabilities(uuid,text[])','execute'),'anon cannot write');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a5200000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select lives_ok($$select public.set_unit_capabilities('c5200000-0000-0000-0000-000000000001',array['BOAT','EMS'])$$,'lead sets own capabilities');
select is((select count(*)::int from public.unit_capabilities),2,'lead reads own capabilities');
select is((select count(*)::int from public.cases where case_code='TF52-RLS-FIRE'),1,'capability filter does not hide cases in RLS');
select throws_ok($$select public.set_unit_capabilities('c5200000-0000-0000-0000-000000000002',array['EMS'])$$,'42501',null,'lead cannot edit another unit');
select throws_ok($$select public.set_unit_capabilities('c5200000-0000-0000-0000-000000000001',array['INVALID'])$$,'22023',null,'invalid capability rejected');
select set_config('request.jwt.claims','{"sub":"a5200000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select is((select count(*)::int from public.unit_capabilities),2,'member reads own unit');
select throws_ok($$select public.set_unit_capabilities('c5200000-0000-0000-0000-000000000001',array['EMS'])$$,'42501',null,'member cannot edit');
select set_config('request.jwt.claims','{"sub":"a5200000-0000-0000-0000-000000000004","role":"authenticated"}',true);
select is((select count(*)::int from public.unit_capabilities),0,'expired lead cannot read');
select throws_ok($$select public.set_unit_capabilities('c5200000-0000-0000-0000-000000000001',array['EMS'])$$,'42501',null,'expired lead cannot edit');
select set_config('request.jwt.claims','{"sub":"a5200000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.set_unit_capabilities('c5200000-0000-0000-0000-000000000002',array['EMS'])$$,'admin edits any unit');
select * from finish();
rollback;
