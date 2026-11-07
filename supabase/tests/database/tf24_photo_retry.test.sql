begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(14);
create function pg_temp.payload(extra jsonb default '{}'::jsonb) returns jsonb language sql as $$
 select jsonb_build_object('consent',true,'healthConsent',true,'consentVersion','2026-11-06',
  'urgency','YELLOW','triageReasons',jsonb_build_array('WATER_LEVEL_UNKNOWN'),
  'canSelfEvacuate',false,'lat',15.42,'lng',100.55,'landmark','ภาพทดสอบ TF24',
  'phone','0892400024','name','TF24','adults',1,'needs','[]'::jsonb) || extra
$$;

select lives_ok($$select * from public.create_sos_case_with_photos('tf24-photo-retry',pg_temp.payload(),100,null,null,'photo-a')$$,'สร้าง SOS พร้อมคีย์รูป');
select lives_ok($$select * from public.create_sos_case_with_photos('tf24-photo-retry',pg_temp.payload(),100,null,null,'photo-a')$$,'ลองซ้ำด้วยข้อมูลเดิมได้');
select is((select count(*)::int from public.cases where idempotency_key='tf24-photo-retry'),1,'ลองซ้ำไม่สร้างเคสซ้ำ');
select throws_ok($$select * from public.create_sos_case_with_photos('tf24-photo-retry',pg_temp.payload(),100,null,null,'different')$$,'SOS25',null,'คีย์เดิมเปลี่ยนรูปไม่ได้');
select lives_ok($$select * from public.create_sos_case_with_photos('tf24-photo-update',pg_temp.payload('{"duplicateAction":"UPDATE_EXISTING"}'),100,null,null,'photo-b')$$,'อัปเดตเคสเดิมพร้อมรูป');
select lives_ok($$select * from public.create_sos_case_with_photos('tf24-photo-update',pg_temp.payload('{"duplicateAction":"UPDATE_EXISTING"}'),100,null,null,'photo-b')$$,'ลองส่งอัปเดตเดิมซ้ำได้');
select is((select count(*)::int from public.case_events e join public.cases c on c.id=e.case_id where c.idempotency_key='tf24-photo-retry' and e.event_type='REPORTER_UPDATED'),1,'ลองซ้ำไม่อัปเดตเคสหรือสร้างเหตุการณ์ซ้ำ');
select lives_ok($$select public.reserve_case_photo(id, id::text || '/' || repeat('a',64) || '.jpg',100) from public.cases where idempotency_key='tf24-photo-retry'$$,'จองรูปแรก');
select lives_ok($$select public.reserve_case_photo(id, id::text || '/' || repeat('a',64) || '.jpg',100) from public.cases where idempotency_key='tf24-photo-retry'$$,'ลองจองรูปเดิมซ้ำได้');
select is((select count(*)::int from public.case_media m join public.cases c on c.id=m.case_id where c.idempotency_key='tf24-photo-retry'),1,'รูปเดิมมีรายการเดียว');
select lives_ok($$select public.reserve_case_photo(id, id::text || '/' || repeat('b',64) || '.jpg',100) from public.cases where idempotency_key='tf24-photo-retry'$$,'จองรูปที่สอง');
select lives_ok($$select public.reserve_case_photo(id, id::text || '/' || repeat('c',64) || '.jpg',100) from public.cases where idempotency_key='tf24-photo-retry'$$,'จองรูปที่สาม');
select throws_ok($$select public.reserve_case_photo(id, id::text || '/' || repeat('d',64) || '.jpg',100) from public.cases where idempotency_key='tf24-photo-retry'$$,'SOS24',null,'ไม่อนุญาตรูปที่สี่');
select ok(not has_function_privilege('authenticated','public.reserve_case_photo(uuid,text,integer)','EXECUTE') and not has_function_privilege('anon','public.create_sos_case_with_photos(text,jsonb,integer,text,uuid,text)','EXECUTE'),'ผู้ใช้ทั่วไปเรียกฟังก์ชันบันทึกเองไม่ได้');
select * from finish();
rollback;
