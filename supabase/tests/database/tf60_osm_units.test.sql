-- ============================================================================
-- TF-60: หน่วยกู้ภัยจริงจาก OpenStreetMap — upsert ตาม osm_id รันซ้ำได้ผลเหมือนเดิม,
-- องค์กรจริงจากตาราง alias, หน่วย OSM ไม่มีเคสผูกและมอบเคสให้ไม่ได้
-- รัน: npx supabase test db
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(16);

create temp table sample as select $json$[
  {"osm_id": "node/960001", "name": "TF60 มูลนิธิร่วมกตัญญู ศูนย์ทดสอบ", "organization": "มูลนิธิร่วมกตัญญู",
   "province": "ระนอง", "district": "เมืองระนอง", "phone": "1669"},
  {"osm_id": "way/960002", "name": "TF60 ศูนย์กู้ชีพทดสอบ", "organization": null,
   "province": "ระนอง", "district": null, "phone": null}
]$json$::jsonb as units;

-- ---------- 1. นำเข้า ----------
select is(public.upsert_osm_units((select units from sample)), 2, 'นำเข้าแถวที่ตรวจแล้ว 2 หน่วย');
select is((select count(*)::int from public.units
  where osm_id in ('node/960001', 'way/960002') and source = 'OSM' and not is_active), 2,
  'หน่วยเป็น source = OSM พร้อม osm_id และยังไม่ได้ใช้ระบบ (is_active = false)');
select ok((select o.name = 'มูลนิธิร่วมกตัญญู' and not o.is_demo
  from public.units u join public.organizations o on o.id = u.organization_id
  where u.osm_id = 'node/960001'), 'สร้างองค์กรจริงจากตาราง alias และผูกหน่วย');
select is((select organization_id from public.units where osm_id = 'way/960002'), null::uuid,
  'แถวที่ไม่มีองค์กร ไม่ผูก');
select is((select contact_phone from public.units where osm_id = 'node/960001'), '1669', 'เก็บเบอร์องค์กร');

-- ---------- 2. รันซ้ำได้ผลเหมือนเดิม ----------
create temp table before_rerun as
  select id, name, branch_name, province, district, contact_phone, organization_id, is_active, updated_at
  from public.units where source = 'OSM';
select is(public.upsert_osm_units((select units from sample)), 0, 'seed ซ้ำ ไม่มีแถวเปลี่ยน');
select is((select count(*)::int from public.units where source = 'OSM'), (select count(*)::int from before_rerun),
  'seed ซ้ำ จำนวนหน่วยเท่าเดิม');
select set_eq(
  $$select id, name, branch_name, province, district, contact_phone, organization_id, is_active, updated_at
    from public.units where source = 'OSM'$$,
  $$select * from before_rerun$$,
  'seed ซ้ำ ทุกค่าเหมือนเดิม');
select is((select count(*)::int from public.organizations where name = 'มูลนิธิร่วมกตัญญู'), 1,
  'seed ซ้ำ ไม่สร้างองค์กรซ้ำ');

-- แอดมินเปิดใช้หน่วยแล้ว: นำเข้ารอบใหม่ (ชื่อเปลี่ยนใน OSM) อัปเดตชื่อแต่ไม่ปิดหน่วย
update public.units set is_active = true where osm_id = 'way/960002';
select is(public.upsert_osm_units(jsonb_build_array(
  (select units -> 1 from sample) || '{"name": "TF60 ศูนย์กู้ชีพทดสอบ (ใหม่)"}')), 1,
  'ชื่อใน OSM เปลี่ยน อัปเดตแถวเดิมตาม osm_id');
select ok((select is_active and name = 'TF60 ศูนย์กู้ชีพทดสอบ (ใหม่)' from public.units where osm_id = 'way/960002'),
  'นำเข้าซ้ำไม่ทับ is_active ที่แอดมินตั้งไว้');

-- ---------- 3. หน่วย OSM ไม่มีเคสผูกอยู่เลย และมอบเคสให้ไม่ได้ ----------
select is((select count(*)::int from public.cases c join public.units u on u.id = c.assigned_unit_id
  where u.source = 'OSM'), 0, 'หน่วย source = OSM ไม่มีเคสผูกอยู่เลย (รวมเคสตัวอย่าง)');
insert into public.cases(case_code, urgency, status, lat, lng, landmark, province, incident_type)
  values ('TF60-C1', 'YELLOW', 'NEW', 9.96, 98.64, 'หน้าวัด', 'ระนอง', 'FLOOD');
select throws_ok($$update public.cases set assigned_unit_id = (select id from public.units where osm_id = 'node/960001')
  where case_code = 'TF60-C1'$$, '23514', null, 'มอบเคสให้หน่วย OSM ไม่ได้');
select throws_ok($$insert into public.cases(case_code, urgency, lat, lng, landmark, province, incident_type, is_demo, assigned_unit_id)
  values ('TF60-DEMO', 'GREEN', 9.96, 98.64, 'x', 'ระนอง', 'FLOOD', true,
          (select id from public.units where osm_id = 'node/960001'))$$, '23514', null,
  'สร้างเคสตัวอย่างผูกหน่วย OSM ไม่ได้');

-- ---------- 4. ความถูกต้องของข้อมูล ----------
select throws_ok($$insert into public.units(name, province, source) values ('ไม่มี osm_id', 'ระนอง', 'OSM')$$,
  '23514', null, 'หน่วย OSM ต้องมี osm_id');
select throws_ok($$select public.upsert_osm_units('{"osm_id": "node/1"}')$$, '22023', null,
  'ข้อมูลต้องเป็น JSON array');

select * from finish();
rollback;
