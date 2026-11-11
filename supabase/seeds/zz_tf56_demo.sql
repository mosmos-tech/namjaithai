-- TF-56: entirely fictional demonstration data. Run by db:reset, not by deploy-db.
-- IDs and attributes are stable; dates shift together with the Bangkok calendar day.
set search_path = public, extensions;

insert into public.organizations (id, name, is_demo, created_at, updated_at) values
  ('d5600000-0000-4000-8000-000000000001', 'องค์กรสมมติ เมฆดาว', true, '2026-01-01 00:00:00+00', '2026-01-01 00:00:00+00'),
  ('d5600000-0000-4000-8000-000000000002', 'องค์กรสมมติ สายนที', true, '2026-01-01 00:00:00+00', '2026-01-01 00:00:00+00'),
  ('d5600000-0000-4000-8000-000000000003', 'องค์กรสมมติ ต้นรุ้ง', true, '2026-01-01 00:00:00+00', '2026-01-01 00:00:00+00'),
  ('d5600000-0000-4000-8000-000000000004', 'องค์กรสมมติ แสงเดือน', true, '2026-01-01 00:00:00+00', '2026-01-01 00:00:00+00')
on conflict (id) do nothing;

with provinces as (
  select p.code, p.name_th, row_number() over (order by p.code)::int as position,
    (select d.name_th from public.districts d where d.province_code = p.code order by d.code limit 1) as district
  from public.provinces p
)
insert into public.units (id, code, name, province, district, organization_id, branch_name, source, is_active, created_at, updated_at)
select ('d5610000-0000-4000-8000-' || lpad(code::text, 12, '0'))::uuid,
  'DEMO-' || code::text, 'หน่วยสมมติ ' || name_th || ' (ตัวอย่าง)', name_th, district,
  ('d5600000-0000-4000-8000-' || lpad((((position - 1) % 4) + 1)::text, 12, '0'))::uuid,
  'สาขาสมมติ ' || name_th, 'DEMO', false, '2026-01-01 00:00:00+00', '2026-01-01 00:00:00+00'
from provinces
on conflict (id) do nothing;

with provinces as (
  select p.code, p.name_th, row_number() over (order by p.code)::int as position,
    d.name_th as district, st_pointonsurface(d.geom) as point
  from public.provinces p
  join lateral (select d.name_th, d.geom from public.districts d where d.province_code = p.code order by d.code limit 1) d on true
), samples as (
  select n, p.*, (date_trunc('day', timezone('Asia/Bangkok', now())) - n * interval '1 day' + case when n = 0 then interval '0 hours' else interval '12 hours' end) at time zone 'Asia/Bangkok' as occurred_at
  from generate_series(0, 366) n
  join provinces p on p.position = (n % 77) + 1
)
insert into public.cases (id, case_code, tracking_token, idempotency_key, status, urgency, priority_score,
  lat, lng, province, district, landmark, source, assigned_unit_id, is_demo, incident_type, details,
  rescued_count, accepted_at, resolved_at, closed_at, last_status_updated_at, created_at, updated_at,
  close_confirmation)
select ('d5620000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'DEMO-' || lpad(n::text, 5, '0'), md5('tf56-demo-token-' || n::text), 'tf56-demo-' || n::text,
  'RESOLVED', case when n % 3 = 0 then 'RED'::public.urgency_level when n % 3 = 1 then 'YELLOW'::public.urgency_level else 'GREEN'::public.urgency_level end,
  0, st_y(point), st_x(point), name_th, district, 'จุดสมมติสำหรับข้อมูลตัวอย่าง', 'WEB',
  ('d5610000-0000-4000-8000-' || lpad(code::text, 12, '0'))::uuid, true, 'FLOOD', '{}'::jsonb,
  1 + n % 3, occurred_at + case when n = 0 then interval '0 minutes' else interval '15 minutes' end,
  occurred_at + case when n = 0 then interval '0 hours' else interval '1 hour' end,
  occurred_at + case when n = 0 then interval '0 hours' else interval '1 hour' end,
  occurred_at + case when n = 0 then interval '0 hours' else interval '1 hour' end, occurred_at,
  occurred_at + case when n = 0 then interval '0 hours' else interval '1 hour' end,
  -- TF-57: นับผลงานเฉพาะเคสที่ปิดผ่าน TF-58 — ตายตัว: ทุกเคสที่ 5 ปิดโดยหัวหน้า (กราฟมี 2 สี)
  case when n % 5 = 4 then 'LEAD_UNCONFIRMED' else 'REPORTER_CONFIRMED' end
from samples
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- TF-57: หน่วยโชว์ 4 หน่วยที่มีเคสแน่น ให้กราฟผลงานหน้า /unit/dashboard และ TF-61 มีข้อมูลเสมอ
--   กรุงเทพฯ 2 หน่วย (ชื่อเดียวกัน คนละเขต) · เชียงใหม่ · ภูเก็ต
--   30 วันล่าสุด วันละ 1–3 เคส · ก่อนหน้านั้นวันละ 1–2 เคส ย้อนหลัง 366 วัน
--   (ทุกเดือนรวมเดือนที่คาบ 30 วันล่าสุดอยู่ราว 20–80 เคส ไม่มีวันไหนมาจาก 2 ชุดซ้อนกัน)
--   เคสที่ยังไม่ปิดหน่วยละ 2–3 เคส ให้ช่อง "กำลังช่วย" มีตัวเลข
--   ประเภท: น้ำท่วม 50% · อุบัติเหตุทางถนน 22% · เจ็บป่วย 16% · ไฟไหม้ 12%
--   ปิดโดยหัวหน้า (LEAD_UNCONFIRMED) ~10% · ติดด่านกันปั๊มผลงานรอแอดมินตรวจบางเคส
-- ตายตัว: จำนวน/ประเภท/ผลมาจาก md5 ของค่าคงที่ (ไม่สุ่ม) — วันที่นับถอยหลังจากวันที่รัน seed
-- ----------------------------------------------------------------------------
insert into public.units (id, code, name, province, district, organization_id, branch_name, source, is_active, created_at, updated_at) values
  ('d5630000-0000-4000-8000-000000000001', 'DEMO-S1', 'หน่วยสมมติ สายนที กรุงเทพฯ (ตัวอย่าง)', 'กรุงเทพมหานคร', 'บางรัก',
   'd5600000-0000-4000-8000-000000000002', 'ศูนย์สมมติ สายนที', 'DEMO', false, '2026-01-01 00:00:00+00', '2026-01-01 00:00:00+00'),
  ('d5630000-0000-4000-8000-000000000002', 'DEMO-S2', 'หน่วยสมมติ สายนที กรุงเทพฯ (ตัวอย่าง)', 'กรุงเทพมหานคร', 'ลาดพร้าว',
   'd5600000-0000-4000-8000-000000000002', 'ศูนย์สมมติ สายนที', 'DEMO', false, '2026-01-01 00:00:00+00', '2026-01-01 00:00:00+00'),
  ('d5630000-0000-4000-8000-000000000003', 'DEMO-S3', 'หน่วยสมมติ ต้นรุ้ง เชียงใหม่ (ตัวอย่าง)', 'เชียงใหม่', 'เมืองเชียงใหม่',
   'd5600000-0000-4000-8000-000000000003', 'ศูนย์สมมติ ต้นรุ้ง', 'DEMO', false, '2026-01-01 00:00:00+00', '2026-01-01 00:00:00+00'),
  ('d5630000-0000-4000-8000-000000000004', 'DEMO-S4', 'หน่วยสมมติ แสงเดือน ภูเก็ต (ตัวอย่าง)', 'ภูเก็ต', 'เมืองภูเก็ต',
   'd5600000-0000-4000-8000-000000000004', 'ศูนย์สมมติ แสงเดือน', 'DEMO', false, '2026-01-01 00:00:00+00', '2026-01-01 00:00:00+00')
on conflict (id) do nothing;

-- TF-61: ความสามารถของหน่วยโชว์ ให้ตัวกรอง "ความสามารถ" ในหน้า /units มีผลให้ดู
insert into public.unit_capabilities (unit_id, capability) values
  ('d5630000-0000-4000-8000-000000000001', 'BOAT'),
  ('d5630000-0000-4000-8000-000000000001', 'WATER_RESCUE'),
  ('d5630000-0000-4000-8000-000000000001', 'EMS'),
  ('d5630000-0000-4000-8000-000000000002', 'EMS'),
  ('d5630000-0000-4000-8000-000000000002', 'EXTRICATION'),
  ('d5630000-0000-4000-8000-000000000003', 'BOAT'),
  ('d5630000-0000-4000-8000-000000000003', 'EVACUATION'),
  ('d5630000-0000-4000-8000-000000000004', 'FIRE_SUPPRESSION'),
  ('d5630000-0000-4000-8000-000000000004', 'WATER_RESCUE')
on conflict do nothing;

with showcase(unit_no, lat, lng, province, district) as (values
  (1, 13.7279, 100.5241, 'กรุงเทพมหานคร', 'บางรัก'),
  (2, 13.8162, 100.5617, 'กรุงเทพมหานคร', 'ลาดพร้าว'),
  (3, 18.7883, 98.9853, 'เชียงใหม่', 'เมืองเชียงใหม่'),
  (4, 7.8804, 98.3923, 'ภูเก็ต', 'เมืองภูเก็ต')
), clock as (
  select now() as now_at,
         date_trunc('day', timezone('Asia/Bangkok', now())) at time zone 'Asia/Bangkok' as today_at
), per_day as (
  select s.*, d,
    case when d < 30 then 1 + h % 3 else 1 + h % 2 end as n
  from showcase s
  cross join generate_series(0, 365) d
  cross join lateral (select ('x' || substr(md5('tf57-showcase-' || s.unit_no || '-' || d), 1, 8))::bit(32)::int & 2147483647 as h) x
), items as (
  select p.*, i, k,
    case when d = 0
      -- วันนี้: กระจายระหว่างเที่ยงคืนถึงตอนนี้ (ไม่มีเคสในอนาคต)
      then c.today_at + (c.now_at - c.today_at) * (i::numeric / (p.n + 2))
      else c.today_at - d * interval '1 day' + interval '7 hours' + ((i * 97) % 600) * interval '1 minute'
    end as occurred_at,
    c.now_at
  from per_day p
  cross join clock c
  cross join lateral generate_series(1, p.n) i
  cross join lateral (select ('x' || substr(md5('tf57-case-' || p.unit_no || '-' || p.d || '-' || i), 1, 8))::bit(32)::int & 2147483647 as k) y
)
insert into public.cases (id, case_code, tracking_token, idempotency_key, status, urgency, priority_score,
  lat, lng, province, district, landmark, source, assigned_unit_id, is_demo, incident_type, details,
  rescued_count, accepted_at, resolved_at, closed_at, last_status_updated_at, created_at, updated_at,
  close_confirmation)
select ('d5640000-0000-4000-8' || lpad(unit_no::text, 3, '0') || '-' || lpad((d * 10 + i)::text, 12, '0'))::uuid,
  'DEMO-S' || unit_no || '-' || lpad(d::text, 3, '0') || '-' || i,
  md5('tf57-showcase-token-' || unit_no || '-' || d || '-' || i),
  'tf57-showcase-' || unit_no || '-' || d || '-' || i,
  'RESOLVED',
  (array['RED', 'YELLOW', 'GREEN'])[1 + k % 3]::public.urgency_level, 0,
  lat + ((k >> 3) % 100 - 50) * 0.0002, lng + ((k >> 10) % 100 - 50) * 0.0002,
  province, district, 'จุดสมมติสำหรับข้อมูลตัวอย่าง', 'WEB',
  ('d5630000-0000-4000-8000-' || lpad(unit_no::text, 12, '0'))::uuid, true,
  case when k % 100 < 50 then 'FLOOD' when k % 100 < 72 then 'ROAD_ACCIDENT'
       when k % 100 < 88 then 'MEDICAL' else 'FIRE' end,
  '{}'::jsonb,
  1 + (k >> 4) % 4,
  occurred_at + (least(now_at, occurred_at + interval '1 hour') - occurred_at) / 4,
  least(now_at, occurred_at + interval '1 hour'),
  least(now_at, occurred_at + interval '1 hour'),
  least(now_at, occurred_at + interval '1 hour'),
  occurred_at,
  least(now_at, occurred_at + interval '1 hour'),
  case when (k >> 8) % 10 = 0 then 'LEAD_UNCONFIRMED' else 'REPORTER_CONFIRMED' end
from items
on conflict (id) do nothing;

-- ติดด่านกันปั๊มผลงาน (รอแอดมินตรวจ) — เลือกจากเลขท้าย id ตายตัว
insert into public.case_performance_reviews (case_id, unit_id, reasons, created_at)
select c.id, c.assigned_unit_id,
  case when right(c.id::text, 12)::bigint % 2 = 0 then array['TOO_FAST'] else array['REPORTER_IS_MEMBER'] end,
  c.resolved_at
from public.cases c
where c.id::text like 'd5640000-0000-4000-8%' and right(c.id::text, 12)::bigint % 97 = 3
on conflict (case_id) do nothing;

-- เคสที่หน่วยโชว์กำลังช่วยอยู่ (หน่วยละ 2–3 เคส ตายตัว) — ไม่ใช่เคสแดง จึงไม่เข้าคิวแจ้งเตือนเคสแดง
insert into public.cases (id, case_code, tracking_token, idempotency_key, status, urgency, priority_score,
  lat, lng, province, district, landmark, source, assigned_unit_id, is_demo, incident_type, details,
  accepted_at, last_status_updated_at, created_at, updated_at)
select ('d5650000-0000-4000-8000-' || lpad((s.unit_no * 10 + j)::text, 12, '0'))::uuid,
  'DEMO-S' || s.unit_no || '-A' || j,
  md5('tf57-showcase-active-token-' || s.unit_no || '-' || j),
  'tf57-showcase-active-' || s.unit_no || '-' || j,
  (array['ACCEPTED', 'EN_ROUTE', 'ON_SITE'])[j]::public.case_status,
  (array['YELLOW', 'GREEN', 'YELLOW'])[j]::public.urgency_level, 0,
  s.lat + j * 0.001, s.lng - j * 0.001, s.province, s.district, 'จุดสมมติสำหรับข้อมูลตัวอย่าง', 'WEB',
  ('d5630000-0000-4000-8000-' || lpad(s.unit_no::text, 12, '0'))::uuid, true,
  (array['FLOOD', 'ROAD_ACCIDENT', 'MEDICAL'])[j], '{}'::jsonb,
  now() - j * interval '20 minutes', now() - j * interval '10 minutes',
  now() - j * interval '30 minutes', now() - j * interval '10 minutes'
from (values
  (1, 13.7279, 100.5241, 'กรุงเทพมหานคร', 'บางรัก'),
  (2, 13.8162, 100.5617, 'กรุงเทพมหานคร', 'ลาดพร้าว'),
  (3, 18.7883, 98.9853, 'เชียงใหม่', 'เมืองเชียงใหม่'),
  (4, 7.8804, 98.3923, 'ภูเก็ต', 'เมืองภูเก็ต')
) s(unit_no, lat, lng, province, district)
cross join lateral generate_series(1, 2 + s.unit_no % 2) j
on conflict (id) do nothing;
