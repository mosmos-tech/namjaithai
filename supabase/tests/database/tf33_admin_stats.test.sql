begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(13);
insert into auth.users(id) values ('a3300000-0000-0000-0000-000000000001'), ('a3300000-0000-0000-0000-000000000002');
insert into public.users(id, auth_user_id, display_name, role, status) values
 ('b3300000-0000-0000-0000-000000000001','a3300000-0000-0000-0000-000000000001','TF33 admin','ADMIN','ACTIVE'),
 ('b3300000-0000-0000-0000-000000000002','a3300000-0000-0000-0000-000000000002','TF33 user','USER','ACTIVE');
insert into public.cases(case_code,status,urgency,lat,lng,landmark,province,incident_type,created_at,closed_at) values
 ('TF33-RED','NEW','RED',13,100,'TF33','TF33 Province','FLOOD','2020-01-01 17:00+00',null),
 ('TF33-BLUE','ACCEPTED','YELLOW',13,100,'TF33','TF33 Province','FIRE','2020-01-02 16:59+00',null),
 ('TF33-CLOSED','RESOLVED','GREEN',13,100,'TF33','TF33 Province','FIRE','2020-01-02 17:00+00',now()),
 ('TF33-OTHER','NEW','RED',13,100,'TF33','TF33 Elsewhere','FLOOD','2020-01-01 17:00+00',null);
insert into public.cases(case_code,status,urgency,lat,lng,landmark,province,incident_type,created_at)
values ('TF33-AWAITING','AWAITING_CONFIRMATION','YELLOW',13,100,'TF33','TF33 Waiting','FLOOD','2020-01-01 17:00+00');
insert into public.units(id,name,province,source) values ('c3300000-0000-0000-0000-000000000001','TF33 demo','TF33 Province','DEMO');
insert into public.cases(case_code,status,urgency,lat,lng,landmark,province,incident_type,is_demo,assigned_unit_id)
values ('TF33-DEMO','NEW','RED',13,100,'TF33','TF33 Province','FLOOD',true,'c3300000-0000-0000-0000-000000000001');
insert into public.cases(case_code,status,urgency,lat,lng,landmark,province,incident_type,created_at)
select 'TF33-BULK-' || n,'NEW','GREEN',13,100,'TF33','TF33 Bulk','FLOOD','2001-01-01 00:00+00' from generate_series(1,1001) n;
select set_config('request.jwt.claims','{"sub":"a3300000-0000-0000-0000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$select public.admin_case_statistics(null,null,null)$$,'42501',null,'ผู้ใช้ทั่วไปอ่านสถิติแอดมินไม่ได้');
select set_config('request.jwt.claims','{"sub":"a3300000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select is((public.admin_case_statistics('TF33 Province',null,null)->>'open')::int,2,'จำนวนเคสเปิดตามจังหวัด');
select is((public.admin_case_statistics('TF33 Province',null,null)->>'critical_waiting')::int,1,'วิกฤตรอคนรับ');
select is((public.admin_case_statistics('TF33 Province',null,null)->>'helping')::int,1,'กำลังช่วยเหลือ');
select ok((public.admin_case_statistics('TF33 Waiting',null,null)->>'open')::int = 1 and (public.admin_case_statistics('TF33 Waiting',null,null)->>'helping')::int = 0,'รอผู้แจ้งยืนยันเป็นเคสเปิด แต่ช่วยเสร็จแล้ว');
select is((public.admin_case_statistics('TF33 Province',null,null)->>'closed_today')::int,1,'ปิดวันนี้ตามเวลาไทย');
select is((select sum((x->>'count')::int)::int from jsonb_array_elements(public.admin_case_statistics('TF33 Province','2020-01-02','2020-01-02')->'urgencies') x),2,'ช่วงวันตามเวลาไทยรวมทั้งต้นและท้ายวัน');
select is((select (x->>'count')::int from jsonb_array_elements(public.admin_case_statistics('TF33 Province','2020-01-02','2020-01-02')->'incidents') x where x->>'name'='FIRE'),1,'สถิติแยกประเภทเหตุ');
select is((select (x->>'count')::int from jsonb_array_elements(public.admin_case_statistics('TF33 Province',null,null)->'provinces') x where x->>'name'='TF33 Province'),3,'สถิติแยกจังหวัด');
select is((select (x->>'count')::int from jsonb_array_elements(public.admin_case_statistics('TF33 Bulk',null,null)->'incidents') x where x->>'name'='FLOOD'),1001,'นับครบแม้เกิน 1000 เคส');
select is(jsonb_array_length(public.admin_case_statistics('TF33 Missing',null,null)->'provinces'),0,'ไม่มีเคสแสดงรายการว่าง');
select throws_ok($$select public.admin_case_statistics(null,'2020-02-01','2020-01-01')$$,'22023',null,'ปฏิเสธช่วงวันที่กลับด้าน');
select ok(not has_function_privilege('anon','public.admin_case_statistics(text,date,date,text)','execute'),'ผู้ไม่ล็อกอินเรียกไม่ได้ (TF-38: เพิ่มพารามิเตอร์ประเภทเหตุ)');
select * from finish();
rollback;
