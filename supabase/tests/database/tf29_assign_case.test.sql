begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(21);

insert into auth.users(id) select ('a2900000-0000-0000-0000-' || lpad(g::text,12,'0'))::uuid from generate_series(1,6) g;
insert into public.users(id, auth_user_id, display_name, role, status, line_user_id)
select ('b2900000-0000-0000-0000-' || lpad(g::text,12,'0'))::uuid,
       ('a2900000-0000-0000-0000-' || lpad(g::text,12,'0'))::uuid,
       'TF29-' || g, (case when g=1 then 'UNIT_LEAD' when g=6 then 'ADMIN' else 'RESCUER' end)::public.user_role,
       'ACTIVE', 'U' || lpad(to_hex(2900+g),32,'0') from generate_series(1,6) g;
insert into public.units(id,name,province) values
('c2900000-0000-0000-0000-000000000001','TF29 หนึ่ง','น่าน'),
('c2900000-0000-0000-0000-000000000002','TF29 สอง','แพร่');
insert into public.units(id,name,province,source) values
('c2900000-0000-0000-0000-000000000003','TF29 ตัวอย่าง','น่าน','DEMO');
insert into public.unit_members(unit_id,user_id,role_in_unit,status) values
('c2900000-0000-0000-0000-000000000001','b2900000-0000-0000-0000-000000000001','LEAD','APPROVED'),
('c2900000-0000-0000-0000-000000000001','b2900000-0000-0000-0000-000000000002','MEMBER','APPROVED'),
('c2900000-0000-0000-0000-000000000001','b2900000-0000-0000-0000-000000000003','MEMBER','APPROVED'),
('c2900000-0000-0000-0000-000000000002','b2900000-0000-0000-0000-000000000001','MEMBER','APPROVED'),
('c2900000-0000-0000-0000-000000000002','b2900000-0000-0000-0000-000000000004','MEMBER','APPROVED'),
('c2900000-0000-0000-0000-000000000001','b2900000-0000-0000-0000-000000000005','MEMBER','PENDING'),
('c2900000-0000-0000-0000-000000000001','b2900000-0000-0000-0000-000000000006','MEMBER','APPROVED'),
('c2900000-0000-0000-0000-000000000003','b2900000-0000-0000-0000-000000000001','LEAD','APPROVED'),
('c2900000-0000-0000-0000-000000000003','b2900000-0000-0000-0000-000000000002','MEMBER','APPROVED'),
('c2900000-0000-0000-0000-000000000003','b2900000-0000-0000-0000-000000000006','LEAD','APPROVED');
insert into public.cases(id,case_code,urgency,status,lat,lng,landmark,province,incident_type)
values ('d2900000-0000-0000-0000-000000000001','TF29-1','YELLOW','NEW',18.8,100.7,'ทดสอบ','น่าน','FLOOD');
insert into public.cases(id,case_code,urgency,status,lat,lng,landmark,province,incident_type)
values ('d2900000-0000-0000-0000-000000000002','TF29-OTHER','YELLOW','NEW',18.8,100.7,'ทดสอบ','แพร่','FLOOD');
insert into public.cases(id,case_code,urgency,status,lat,lng,landmark,province,incident_type,is_demo,assigned_unit_id,assigned_rescuer_id)
values ('d2900000-0000-0000-0000-000000000003','TF29-DEMO','YELLOW','NEW',18.8,100.7,'ตัวอย่าง','น่าน','FLOOD',true,'c2900000-0000-0000-0000-000000000003',null),
       ('d2900000-0000-0000-0000-000000000004','TF29-DEMO1','YELLOW','ACCEPTED',18.8,100.7,'ตัวอย่าง','น่าน','FLOOD',true,'c2900000-0000-0000-0000-000000000003','b2900000-0000-0000-0000-000000000002'),
       ('d2900000-0000-0000-0000-000000000005','TF29-DEMO2','YELLOW','ACCEPTED',18.8,100.7,'ตัวอย่าง','น่าน','FLOOD',true,'c2900000-0000-0000-0000-000000000003','b2900000-0000-0000-0000-000000000002');
create function pg_temp.as_user(n int) returns void language sql as $$
  select set_config('request.jwt.claims',json_build_object('sub','a2900000-0000-0000-0000-' || lpad(n::text,12,'0'),'role','authenticated')::text,true);
$$;
grant execute on function pg_temp.as_user(int) to authenticated;
set local role authenticated;
select pg_temp.as_user(2);
select throws_ok($$select public.assign_case('d2900000-0000-0000-0000-000000000001','c2900000-0000-0000-0000-000000000001','b2900000-0000-0000-0000-000000000002',1)$$,'42501',null,'สมาชิกธรรมดามอบหมายไม่ได้');
select pg_temp.as_user(1);
select is((select count(*)::int from public.case_assignment_options('d2900000-0000-0000-0000-000000000003')),0,'เคสตัวอย่างไม่แสดงตัวเลือกมอบหมาย');
select throws_ok($$select public.assign_case('d2900000-0000-0000-0000-000000000003','c2900000-0000-0000-0000-000000000003','b2900000-0000-0000-0000-000000000002',1)$$,'42501',null,'มอบหมายเคสตัวอย่างไม่ได้');
select pg_temp.as_user(6);
select throws_ok($$select public.assign_case('d2900000-0000-0000-0000-000000000003','c2900000-0000-0000-0000-000000000003','b2900000-0000-0000-0000-000000000002',1)$$,'42501',null,'แอดมินซึ่งเห็นเคสตัวอย่างก็มอบหมายไม่ได้');
select pg_temp.as_user(1);
select is((select count(*)::int from public.case_assignment_options('d2900000-0000-0000-0000-000000000001') where user_id='b2900000-0000-0000-0000-000000000006'),0,'แอดมินไม่อยู่ในรายชื่อผู้รับเคส');
select throws_ok($$select public.assign_case('d2900000-0000-0000-0000-000000000001','c2900000-0000-0000-0000-000000000001','b2900000-0000-0000-0000-000000000006',1)$$,'42501',null,'มอบหมายเคสให้แอดมินไม่ได้');
select throws_ok($$select public.assign_case('d2900000-0000-0000-0000-000000000002','c2900000-0000-0000-0000-000000000001','b2900000-0000-0000-0000-000000000002',1)$$,'42501',null,'หัวหน้ามอบเคสต่างจังหวัดเข้าหน่วยตนไม่ได้แม้มองเห็นจากหน่วยอื่น');
select is(public.assign_case('d2900000-0000-0000-0000-000000000001','c2900000-0000-0000-0000-000000000001','b2900000-0000-0000-0000-000000000002',null)->>'status','STALE','version ว่างมอบหมายไม่ได้');
select throws_ok($$select public.assign_case('d2900000-0000-0000-0000-000000000001','c2900000-0000-0000-0000-000000000001','b2900000-0000-0000-0000-000000000004',1)$$,'42501',null,'มอบหมายให้คนนอกหน่วยไม่ได้');
select throws_ok($$select public.assign_case('d2900000-0000-0000-0000-000000000001','c2900000-0000-0000-0000-000000000001','b2900000-0000-0000-0000-000000000005',1)$$,'42501',null,'มอบหมายให้คนรออนุมัติไม่ได้');
select is(public.assign_case('d2900000-0000-0000-0000-000000000001','c2900000-0000-0000-0000-000000000001','b2900000-0000-0000-0000-000000000002',1)->>'status','ASSIGNED','เคสตัวอย่างไม่นับในเพดาน มอบหมายเคสจริงได้');
select is((select assigned_rescuer_id::text from public.cases where id='d2900000-0000-0000-0000-000000000001'),'b2900000-0000-0000-0000-000000000002','เคสระบุลูกทีม');
select is((select status::text from public.cases where id='d2900000-0000-0000-0000-000000000001'),'ACCEPTED','เคสใหม่เปลี่ยนเป็นรับเคส');
select is(public.assign_case('d2900000-0000-0000-0000-000000000001','c2900000-0000-0000-0000-000000000001','b2900000-0000-0000-0000-000000000003',1)->>'status','STALE','version เก่ามอบหมายทับไม่ได้');
select is(public.assign_case('d2900000-0000-0000-0000-000000000001','c2900000-0000-0000-0000-000000000001','b2900000-0000-0000-0000-000000000003',2)->>'status','ASSIGNED','ย้ายเคสให้สมาชิกอีกคนได้');
select is(public.assign_case('d2900000-0000-0000-0000-000000000001','c2900000-0000-0000-0000-000000000001','b2900000-0000-0000-0000-000000000003',3)->>'status','UNCHANGED','มอบหมายคนเดิมไม่สร้างประวัติซ้ำ');
reset role;
insert into public.cases(case_code,urgency,status,lat,lng,landmark,province,incident_type,assigned_unit_id,assigned_rescuer_id)
values ('TF29-L1','YELLOW','ACCEPTED',18.8,100.7,'ทดสอบ','น่าน','FLOOD','c2900000-0000-0000-0000-000000000001','b2900000-0000-0000-0000-000000000002'),
       ('TF29-L2','YELLOW','ACCEPTED',18.8,100.7,'ทดสอบ','น่าน','FLOOD','c2900000-0000-0000-0000-000000000001','b2900000-0000-0000-0000-000000000002');
set local role authenticated;
select pg_temp.as_user(1);
select is(public.assign_case('d2900000-0000-0000-0000-000000000001','c2900000-0000-0000-0000-000000000001','b2900000-0000-0000-0000-000000000002',3)->>'status','LIMIT','สมาชิกที่ถือสองเคสแล้วรับเพิ่มไม่ได้');
select pg_temp.as_user(3);
select is((select count(*)::int from public.cases where assigned_rescuer_id='b2900000-0000-0000-0000-000000000003' and id='d2900000-0000-0000-0000-000000000001'),1,'ผู้รับใหม่เห็นเคสของตน');
select throws_ok($$update public.cases set assigned_rescuer_id='b2900000-0000-0000-0000-000000000004' where id='d2900000-0000-0000-0000-000000000001'$$,'42501',null,'ห้ามแก้ผู้รับตรงโดยไม่บันทึก');
reset role;
select is((select count(*)::int from public.case_events where case_id='d2900000-0000-0000-0000-000000000001' and event_type='ASSIGNED' and actor_user_id='b2900000-0000-0000-0000-000000000001'),2,'ประวัติบันทึกหัวหน้าที่มอบหมาย');
select is((select count(*)::int from public.audit_logs where case_id='d2900000-0000-0000-0000-000000000001' and action='CASE_ASSIGNED'),2,'audit บันทึกทั้งสองครั้ง');
select * from finish();
rollback;
