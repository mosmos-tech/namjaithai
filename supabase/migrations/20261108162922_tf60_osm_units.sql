-- ============================================================================
-- TF-60: หน่วยกู้ภัยจริงจาก OpenStreetMap (© OpenStreetMap contributors, ODbL — ดู data/README.md)
--   1. units.osm_id (node/123 หรือ way/123) — หน่วย source = OSM ต้องมี osm_id
--   2. upsert_osm_units(jsonb): เพิ่ม/อัปเดตตาม osm_id รันซ้ำได้ผลเหมือนเดิม
--      หน่วยใหม่ is_active = false ("ยังไม่ได้ใช้ระบบ" — ไม่รับเคส ไม่ได้แจ้งเตือน)
--      สร้างองค์กรจริงได้เฉพาะชื่อในตาราง alias (scripts/osm/osm-units.ts ตรวจก่อนส่งมา)
--   3. มอบเคสให้หน่วย OSM ไม่ได้ — ไม่มีผลงานปลอมผูกกับหน่วยจริงที่ยังไม่ได้ใช้ระบบ
-- ข้อมูลจริงเข้าผ่าน seed (ในเครื่อง) และ migration ที่สร้างด้วย npm run osm:build-migration (production)
-- ============================================================================

alter table public.units
  add column osm_id text unique check (osm_id ~ '^(node|way)/[0-9]+$'),
  add constraint units_osm_source_has_osm_id check ((source = 'OSM') = (osm_id is not null));
comment on column public.units.osm_id is
  'TF-60: รหัสจุดใน OpenStreetMap (node/123 หรือ way/123) ของหน่วยที่นำเข้า (source = OSM)';

-- ----------------------------------------------------------------------------
-- 1. นำเข้าหน่วย OSM
--    รูปแบบแต่ละแถว: {"osm_id","name","organization"|null,"province","district"|null,"phone"|null}
--    รันซ้ำ: อัปเดตชื่อ/พื้นที่/เบอร์/องค์กรตาม OSM แต่ไม่แตะ is_active (แอดมินอาจเปิดใช้หน่วยแล้ว)
-- ----------------------------------------------------------------------------
create function public.upsert_osm_units(p_units jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  if jsonb_typeof(p_units) is distinct from 'array' then
    raise exception 'p_units must be a JSON array' using errcode = '22023';
  end if;

  -- องค์กรจริงจากตาราง alias (ไม่ใช่องค์กรสมมติ) — มีอยู่แล้วก็ใช้ของเดิม
  insert into public.organizations (name, is_demo)
  select distinct btrim(u ->> 'organization'), false
  from jsonb_array_elements(p_units) u
  where nullif(btrim(u ->> 'organization'), '') is not null
  on conflict (name) do nothing;

  insert into public.units as t (
    osm_id, source, name, branch_name, province, district, contact_phone, organization_id, is_active
  )
  select
    u ->> 'osm_id',
    'OSM',
    btrim(u ->> 'name'),
    btrim(u ->> 'name'),
    btrim(u ->> 'province'),
    nullif(btrim(u ->> 'district'), ''),
    nullif(btrim(u ->> 'phone'), ''),
    o.id,
    false
  from jsonb_array_elements(p_units) u
  left join public.organizations o
    on o.name = nullif(btrim(u ->> 'organization'), '') and not o.is_demo
  on conflict (osm_id) do update
    set name = excluded.name,
        branch_name = excluded.branch_name,
        province = excluded.province,
        district = excluded.district,
        contact_phone = excluded.contact_phone,
        organization_id = excluded.organization_id
    where (t.name, t.branch_name, t.province, t.district, t.contact_phone, t.organization_id)
      is distinct from
      (excluded.name, excluded.branch_name, excluded.province, excluded.district,
       excluded.contact_phone, excluded.organization_id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.upsert_osm_units(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_osm_units(jsonb) to service_role;

-- ----------------------------------------------------------------------------
-- 2. หน่วย OSM ยังไม่ได้ใช้ระบบ: มอบเคสให้ไม่ได้ (ล็อกแถวหน่วยกันเปลี่ยน source ระหว่างเช็ก)
-- ----------------------------------------------------------------------------
create function public.guard_osm_case_unit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.assigned_unit_id is not null and exists (
    select 1 from public.units u where u.id = new.assigned_unit_id and u.source = 'OSM' for share
  ) then
    raise exception 'OSM units are not using the system yet' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_osm_case_unit() from public, anon, authenticated;
create trigger trg_guard_osm_case_unit before insert or update of assigned_unit_id on public.cases
  for each row execute function public.guard_osm_case_unit();
