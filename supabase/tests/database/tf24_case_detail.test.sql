begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(15);
select is((select public from storage.buckets where id='case-media'),false,'bucket รูปเป็นแบบส่วนตัว');

insert into auth.users(id) values
 ('a2400000-0000-4000-8000-000000000001'), ('a2400000-0000-4000-8000-000000000002'),
 ('a2400000-0000-4000-8000-000000000003'), ('a2400000-0000-4000-8000-000000000004');
insert into public.users(id, auth_user_id, display_name, role, status) values
 ('b2400000-0000-4000-8000-000000000001','a2400000-0000-4000-8000-000000000001','TF24 rescuer','RESCUER','ACTIVE'),
 ('b2400000-0000-4000-8000-000000000002','a2400000-0000-4000-8000-000000000002','TF24 colleague','RESCUER','ACTIVE'),
 ('b2400000-0000-4000-8000-000000000003','a2400000-0000-4000-8000-000000000003','TF24 other','RESCUER','ACTIVE'),
 ('b2400000-0000-4000-8000-000000000004','a2400000-0000-4000-8000-000000000004','TF24 admin','ADMIN','ACTIVE');
insert into public.units(id, name, province) values
 ('c2400000-0000-4000-8000-000000000001','TF24 unit','กรุงเทพมหานคร'),
 ('c2400000-0000-4000-8000-000000000002','TF24 other unit','เชียงใหม่');
insert into public.unit_members(unit_id,user_id,status,role_in_unit) values
 ('c2400000-0000-4000-8000-000000000001','b2400000-0000-4000-8000-000000000001','APPROVED','MEMBER'),
 ('c2400000-0000-4000-8000-000000000001','b2400000-0000-4000-8000-000000000002','APPROVED','MEMBER'),
 ('c2400000-0000-4000-8000-000000000002','b2400000-0000-4000-8000-000000000003','APPROVED','MEMBER');
insert into public.cases(id,case_code,urgency,lat,lng,province,landmark,status,assigned_unit_id,assigned_rescuer_id) values
 ('d2400000-0000-4000-8000-000000000001','TF24-ACCEPTED','RED',13.75,100.5,'กรุงเทพมหานคร','จุดทดสอบ','ACCEPTED','c2400000-0000-4000-8000-000000000001','b2400000-0000-4000-8000-000000000001'),
 ('d2400000-0000-4000-8000-000000000002','TF24-NEW','YELLOW',13.75,100.5,'กรุงเทพมหานคร','จุดทดสอบ','NEW',null,null);
insert into public.case_contacts(case_id,name,phone,phone_last4,line_id) values
 ('d2400000-0000-4000-8000-000000000001','ทดสอบ','0891234567','4567','tf24-test');
insert into public.case_sensitive_details(case_id,details) values
 ('d2400000-0000-4000-8000-000000000001','{"hasInjured":true}');
insert into public.case_media(case_id,storage_path) values
 ('d2400000-0000-4000-8000-000000000001','tf24/test.jpg');
insert into storage.objects(bucket_id,name) values ('case-media','tf24/test.jpg');

set local role anon;
select throws_ok($$select public.reveal_case_contact('d2400000-0000-4000-8000-000000000001')$$,'42501',null,'ผู้ไม่ล็อกอินเปิดเบอร์ไม่ได้');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a2400000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((public.case_detail_permissions('d2400000-0000-4000-8000-000000000001')->>'contact')::boolean,false,'กู้ภัยที่ไม่ได้รับเคสไม่มีปุ่ม');
select throws_ok($$select public.reveal_case_contact('d2400000-0000-4000-8000-000000000001')$$,'42501',null,'กู้ภัยที่ไม่ได้รับเคสเปิดเบอร์ไม่ได้');
select is((select count(*)::int from public.case_sensitive_details),0,'กู้ภัยที่ไม่ได้รับเคสไม่เห็นข้อมูลสุขภาพ');
select is((select count(*)::int from storage.objects where bucket_id='case-media' and name='tf24/test.jpg'),0,'กู้ภัยที่ไม่ได้รับเคสไม่เห็นรูป');
select set_config('request.jwt.claims','{"sub":"a2400000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select public.case_detail_permissions('d2400000-0000-4000-8000-000000000001')$$,'42501',null,'กู้ภัยต่างพื้นที่เปิดเคสไม่ได้');
select set_config('request.jwt.claims','{"sub":"a2400000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*)::int from public.case_contacts where case_id='d2400000-0000-4000-8000-000000000001'),0,'ผู้รับเคสอ่านเบอร์โดยตรงเพื่อเลี่ยง audit ไม่ได้');
select is((public.case_detail_permissions('d2400000-0000-4000-8000-000000000001')->>'contact')::boolean,true,'ผู้รับเคสมีสิทธิ์เปิดเบอร์');
select is(public.reveal_case_contact('d2400000-0000-4000-8000-000000000001')->>'phone','0891234567','ผู้รับเคสเปิดเบอร์ได้');
select is((select count(*)::int from public.case_sensitive_details),1,'ผู้รับเคสเห็นข้อมูลสุขภาพ');
select is((select count(*)::int from storage.objects where bucket_id='case-media' and name='tf24/test.jpg'),1,'ผู้รับเคสเห็นรูป');
select set_config('request.jwt.claims','{"sub":"a2400000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select is((select count(*)::int from public.case_contacts where case_id='d2400000-0000-4000-8000-000000000001'),0,'แอดมินอ่านเบอร์โดยตรงเพื่อเลี่ยง audit ไม่ได้');
select is(public.reveal_case_contact('d2400000-0000-4000-8000-000000000001')->>'phone','0891234567','แอดมินเปิดเบอร์ได้');
select is((select count(*)::int from public.audit_logs where case_id='d2400000-0000-4000-8000-000000000001' and action='CASE_CONTACT_REVEALED'),2,'เปิดเบอร์แต่ละครั้งมี audit log');
select * from finish();
rollback;
