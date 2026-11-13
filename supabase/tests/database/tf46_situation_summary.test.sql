begin;
select plan(7);
select ok(has_function_privilege('service_role', 'public.public_situation_summary()', 'EXECUTE'), 'service role can read aggregate');
select ok(not has_function_privilege('anon', 'public.public_situation_summary()', 'EXECUTE'), 'anonymous users cannot call database function directly');
select ok(not has_function_privilege('authenticated', 'public.public_situation_summary()', 'EXECUTE'), 'authenticated users cannot call database function directly');
create temporary table summary_before as
  select public.public_situation_summary() as data;
insert into public.cases (case_code, urgency, status, incident_type, province, lat, lng, landmark)
values ('TF46-TEST-NEW', 'YELLOW', 'NEW', 'FLOOD', 'กรุงเทพมหานคร', 13.75, 100.5, 'synthetic test');
insert into public.cases (case_code, urgency, status, incident_type, province, lat, lng, landmark, rescued_count, resolved_at)
values ('TF46-TEST-DONE', 'YELLOW', 'RESOLVED', 'FLOOD', 'กรุงเทพมหานคร', 13.75, 100.5, 'synthetic test', 3, now());
create temporary table summary_after as select public.public_situation_summary() as data;
select is((select (p->>'waiting')::int from summary_after, jsonb_array_elements(data->'provinces') p where p->>'name' = 'กรุงเทพมหานคร') -
  (select (p->>'waiting')::int from summary_before, jsonb_array_elements(data->'provinces') p where p->>'name' = 'กรุงเทพมหานคร'), 1, 'new case increments province waiting total');
select is((select (p->>'rescued')::int from summary_after, jsonb_array_elements(data->'provinces') p where p->>'name' = 'กรุงเทพมหานคร') -
  (select (p->>'rescued')::int from summary_before, jsonb_array_elements(data->'provinces') p where p->>'name' = 'กรุงเทพมหานคร'), 3, 'resolved people today are counted');
select is((select (i->>'waiting')::int from summary_after, jsonb_array_elements(data->'provinces') p, jsonb_array_elements(p->'incidents') i where p->>'name' = 'กรุงเทพมหานคร' and i->>'code' = 'FLOOD') -
  (select (i->>'waiting')::int from summary_before, jsonb_array_elements(data->'provinces') p, jsonb_array_elements(p->'incidents') i where p->>'name' = 'กรุงเทพมหานคร' and i->>'code' = 'FLOOD'), 1, 'waiting cases are counted per incident type');
select ok((select data::text not like '%TF46-TEST%' and data::text not like '%synthetic test%' from summary_after), 'summary does not contain individual case identifiers or landmarks');
select * from finish();
rollback;
