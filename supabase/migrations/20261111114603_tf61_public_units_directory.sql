-- ============================================================================
-- TF-61: หน้าสาธารณะ /units และ /units/[id] (เปิดได้โดยไม่ล็อกอิน)
--   1. public_unit_directory(): รายชื่อหน่วยที่แสดงได้ + ความสามารถ + ยอดช่วยสำเร็จรวม
--   2. public_unit_profile(id): หน่วยเดียว + ตัวเลขสรุป (กำลังช่วย / 30 วัน / ทั้งหมด / คนที่ช่วยได้)
--   กราฟ 30 วันใช้ public_unit_daily_helped() ของ TF-57
-- ส่งออกแค่ ชื่อองค์กร ชื่อศูนย์ อำเภอ จังหวัด ความสามารถ source และยอดรวม
--   ไม่มีพิกัดเคส รหัสเคส ข้อมูลผู้แจ้ง สมาชิก/หัวหน้าหน่วย พื้นที่รับผิดชอบ หรือ osm_id
--   เบอร์: เฉพาะสายด่วนของหน่วย OSM (TF-60 กรองเบอร์มือถือออกแล้ว) — เบอร์ที่แอดมินกรอกอาจเป็นเบอร์ส่วนตัว จึงไม่ส่ง
-- หน่วยที่แสดง: ADMIN ที่ยังใช้งาน, OSM ทุกหน่วย (ยังไม่ใช้ระบบ = is_active false), DEMO ทุกหน่วย (มีป้าย)
-- ยอดนับตาม rls.unit_case_outcomes ของ TF-57 (ผ่านด่านกันปั๊มผลงานแล้ว) helped = ผู้แจ้งยืนยันเท่านั้น
-- ============================================================================

-- anon อ่านตารางนี้ตรงไม่ได้อยู่แล้ว (policy ให้เฉพาะ authenticated) — ถอนสิทธิ์ให้ชัด ใช้ RPC ด้านล่างแทน
revoke all on public.unit_capabilities from anon;

-- ----------------------------------------------------------------------------
-- 1. รายชื่อหน่วย
-- ----------------------------------------------------------------------------
create function public.public_unit_directory()
returns table (
  id uuid,
  organization_name text,
  branch_name text,
  district text,
  province text,
  capabilities text[],
  source text,
  in_service boolean,
  hotline text,
  helped_total integer
)
language sql stable security definer set search_path = '' as $$
  select u.id,
         o.name,
         coalesce(nullif(btrim(u.branch_name), ''), u.name),
         u.district,
         u.province,
         coalesce(caps.list, '{}'),
         u.source,
         u.is_active,
         case when u.source = 'OSM' then u.contact_phone end,
         coalesce(totals.helped, 0)::int
  from public.units u
  left join public.organizations o on o.id = u.organization_id
  left join (
    select c.unit_id, array_agg(c.capability order by c.capability) as list
    from public.unit_capabilities c group by c.unit_id
  ) caps on caps.unit_id = u.id
  left join (
    select x.unit_id, sum(x.helped) as helped
    from rls.unit_case_outcomes x group by x.unit_id
  ) totals on totals.unit_id = u.id
  where u.is_active or u.source in ('OSM', 'DEMO')
  order by u.province, o.name nulls last, 3, u.district nulls first, u.id;
$$;
comment on function public.public_unit_directory() is
  'TF-61 รายชื่อหน่วยสาธารณะ — ไม่มีข้อมูลเคส ผู้แจ้ง หรือสมาชิก (เบอร์เฉพาะสายด่วนของหน่วย OSM)';
revoke all on function public.public_unit_directory() from public;
grant execute on function public.public_unit_directory() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. หน่วยเดียว + ตัวเลขสรุป (หน่วยที่ไม่อยู่ในรายชื่อคืน 0 แถว)
-- ----------------------------------------------------------------------------
create function public.public_unit_profile(p_unit_id uuid)
returns table (
  id uuid,
  organization_name text,
  branch_name text,
  district text,
  province text,
  capabilities text[],
  source text,
  in_service boolean,
  hotline text,
  helped_total integer,
  lead_closed_total integer,
  helped_30d integer,
  lead_closed_30d integer,
  people_helped integer,
  active_count integer
)
language sql stable security definer set search_path = '' as $$
  -- คอลัมน์ชุดเดียวกับ public_unit_directory() แต่อ่านหน่วยเดียว (ไม่ต้องรวมยอดทุกหน่วย)
  with outcomes as (
    select
      coalesce(sum(x.helped), 0)::int as helped_total,
      coalesce(sum(x.lead_closed), 0)::int as lead_closed_total,
      coalesce(sum(x.helped) filter (where x.day >= (now() at time zone 'Asia/Bangkok')::date - 29), 0)::int
        as helped_30d,
      coalesce(sum(x.lead_closed) filter (where x.day >= (now() at time zone 'Asia/Bangkok')::date - 29), 0)::int
        as lead_closed_30d,
      coalesce(sum(x.people_helped), 0)::int as people_helped
    from rls.unit_case_outcomes x
    where x.unit_id = p_unit_id
  )
  select u.id,
         org.name,
         coalesce(nullif(btrim(u.branch_name), ''), u.name),
         u.district,
         u.province,
         coalesce((select array_agg(c.capability order by c.capability)
                   from public.unit_capabilities c where c.unit_id = u.id), '{}'),
         u.source,
         u.is_active,
         case when u.source = 'OSM' then u.contact_phone end,
         o.helped_total, o.lead_closed_total, o.helped_30d, o.lead_closed_30d, o.people_helped,
         -- นับอย่างเดียว ไม่ส่งรายเคส (ชุดสถานะเดียวกับช่อง "กำลังช่วย" ของ TF-57)
         (select count(*)::int from public.cases c
          where c.assigned_unit_id = u.id
            and c.status in ('ACCEPTED', 'EN_ROUTE', 'ON_SITE', 'AWAITING_CONFIRMATION'))
  from public.units u
  left join public.organizations org on org.id = u.organization_id
  cross join outcomes o
  where u.id = p_unit_id
    and (u.is_active or u.source in ('OSM', 'DEMO'));
$$;
comment on function public.public_unit_profile(uuid) is
  'TF-61 ข้อมูลหน่วยสาธารณะ + ตัวเลขสรุป — นับเฉพาะเคสที่ผ่านด่าน TF-57 ไม่มีรายเคส';
revoke all on function public.public_unit_profile(uuid) from public;
grant execute on function public.public_unit_profile(uuid) to anon, authenticated;
