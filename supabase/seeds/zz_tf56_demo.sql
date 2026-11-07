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
  rescued_count, accepted_at, resolved_at, closed_at, last_status_updated_at, created_at, updated_at)
select ('d5620000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'DEMO-' || lpad(n::text, 5, '0'), md5('tf56-demo-token-' || n::text), 'tf56-demo-' || n::text,
  'RESOLVED', case when n % 3 = 0 then 'RED'::public.urgency_level when n % 3 = 1 then 'YELLOW'::public.urgency_level else 'GREEN'::public.urgency_level end,
  0, st_y(point), st_x(point), name_th, district, 'จุดสมมติสำหรับข้อมูลตัวอย่าง', 'WEB',
  ('d5610000-0000-4000-8000-' || lpad(code::text, 12, '0'))::uuid, true, 'FLOOD', '{}'::jsonb,
  1 + n % 3, occurred_at + case when n = 0 then interval '0 minutes' else interval '15 minutes' end,
  occurred_at + case when n = 0 then interval '0 hours' else interval '1 hour' end,
  occurred_at + case when n = 0 then interval '0 hours' else interval '1 hour' end,
  occurred_at + case when n = 0 then interval '0 hours' else interval '1 hour' end, occurred_at,
  occurred_at + case when n = 0 then interval '0 hours' else interval '1 hour' end
from samples
on conflict (id) do nothing;
