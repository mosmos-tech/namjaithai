begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(5);
insert into public.cases(id,case_code,tracking_token,urgency,incident_type,lat,lng,landmark,province)
values ('d5300000-0000-0000-0000-000000000001','FL-9912-5353','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','RED','FIRE',13.76,100.53,'TF53 test','กรุงเทพมหานคร');
insert into public.case_contacts(case_id,name,phone,phone_last4)
values ('d5300000-0000-0000-0000-000000000001','TF53 test','0812345678','5678');
select ok(not has_function_privilege('anon','public.get_case_tracking(text,text,text,text)','execute'),'anonymous cannot call tracking RPC directly');
select ok(not has_function_privilege('authenticated','public.get_case_tracking(text,text,text,text)','execute'),'authenticated cannot call tracking RPC directly');
select is(public.get_case_tracking('FL-9912-5353',null,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',null)->>'incidentType','FIRE','valid token receives incident type');
select is(public.get_case_tracking('FL-9912-5353','5678',null,null)->>'incidentType','FIRE','valid phone suffix receives incident type');
select is(public.get_case_tracking('FL-9912-5353',null,'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',null),null::jsonb,'invalid token cannot see incident type');
select * from finish();
rollback;
