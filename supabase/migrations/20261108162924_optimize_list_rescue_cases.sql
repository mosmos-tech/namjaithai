-- ============================================================================
-- TF-23 / TF-27: เพิ่มประสิทธิภาพ list_rescue_cases() และ RLS ของ case_people
--   1. ปรับ policy "read people of visible cases" ให้ตรวจสอบผ่าน cases c
--      เพื่อลด overhead จากการเรียก rls.can_see_case() ทีละแถวแบบซ้ำซ้อน
--   2. ปรับ list_rescue_cases() ให้แบ่งหน้า (limit) ก่อน LEFT JOIN case_people
--      ทำให้ไม่ต้อง join และคำนวณ RLS ของ case_people สำหรับเคสที่อยู่นอกหน้านั้น
-- ============================================================================

drop policy if exists "read people of visible cases" on public.case_people;
create policy "read people of visible cases" on public.case_people
  for select to authenticated
  using (
    exists (
      select 1 from public.cases c where c.id = case_people.case_id
    )
  );

create or replace function public.list_rescue_cases(
  p_lat double precision default null,
  p_lng double precision default null,
  p_radius_m integer default null,
  p_sort text default 'PRIORITY',
  p_after_k1 numeric default null,
  p_after_k2 numeric default null,
  p_after_k3 numeric default null,
  p_after_id uuid default null,
  p_limit integer default 100
)
returns table (
  id uuid,
  case_code text,
  status public.case_status,
  incident_type text,
  urgency public.urgency_level,
  triage_reasons text[],
  system_urgency public.urgency_level,
  urgency_override_reason text,
  priority_score integer,
  created_at timestamptz,
  lat double precision,
  lng double precision,
  accuracy_m double precision,
  location_source text,
  province text,
  district text,
  subdistrict text,
  landmark text,
  adults integer,
  elderly integer,
  bedridden integer,
  children integer,
  pets integer,
  distance_m double precision,
  sort_k1 text,
  sort_k2 text,
  sort_k3 text,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = public, extensions
as $func$
#variable_conflict use_column
declare
  v_point geography;
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 100);
begin
  -- หน้านี้สำหรับกู้ภัย/หัวหน้าหน่วย/แอดมินเท่านั้น (ผู้ใช้ทั่วไปมีหน้าเคสของฉันแยก)
  if not (rls.is_admin() or exists (select 1 from rls.my_unit_ids())) then
    raise exception 'rescue case list requires an active unit membership' using errcode = '42501';
  end if;
  if p_sort is null or p_sort not in ('PRIORITY', 'DISTANCE', 'WAITING') then
    raise exception 'invalid sort %', p_sort using errcode = '22023';
  end if;
  if (p_lat is null) <> (p_lng is null) then
    raise exception 'lat and lng must be given together' using errcode = '22023';
  end if;
  if p_radius_m is not null and p_radius_m not in (5000, 10000, 20000) then
    raise exception 'radius must be 5, 10 or 20 km' using errcode = '22023';
  end if;
  if p_radius_m is not null and p_lat is null then
    raise exception 'radius filter needs the caller location' using errcode = '22023';
  end if;
  if p_sort = 'DISTANCE' and p_lat is null then
    raise exception 'distance sort needs the caller location' using errcode = '22023';
  end if;
  if p_after_id is not null and (p_after_k1 is null or p_after_k2 is null or p_after_k3 is null) then
    raise exception 'cursor must include all sort keys' using errcode = '22023';
  end if;

  if p_lat is not null then
    v_point := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;
  end if;

  return query
  with visible as (
    select
      c.*,
      case when v_point is null then null else ST_Distance(c.location, v_point) end as dist,
      case c.urgency when 'RED' then 3 when 'YELLOW' then 2 else 1 end as urgency_rank,
      extract(epoch from c.created_at)::numeric as created_epoch
    from public.cases c
    where c.status in ('NEW', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE')
      and (p_radius_m is null or ST_DWithin(c.location, v_point, p_radius_m))
      -- ไม่มีพิกัดของผู้เรียก: ใช้จังหวัดของหน่วย + เคสที่ตัวเอง/หน่วยรับอยู่ (แอดมินเห็นทั้งหมด)
      and (
        v_point is not null
        or rls.is_admin()
        or c.province in (select rls.my_provinces())
        or c.assigned_rescuer_id = rls.current_user_id()
        or c.assigned_unit_id in (select rls.my_unit_ids())
      )
  ),
  keyed as (
    select
      v.*,
      case p_sort
        when 'PRIORITY' then -v.urgency_rank::numeric
        when 'DISTANCE' then v.dist::numeric
        else case when v.status = 'NEW' then 0 else 1 end::numeric
      end as k1,
      case p_sort
        when 'PRIORITY' then -v.priority_score::numeric
        when 'DISTANCE' then -v.urgency_rank::numeric
        else v.created_epoch
      end as k2,
      case p_sort
        when 'WAITING' then -v.urgency_rank::numeric
        else v.created_epoch
      end as k3
    from visible v
  ),
  counted as (select count(*) as total from keyed),
  paged as (
    select k.*
    from keyed k
    where p_after_id is null or (k.k1, k.k2, k.k3, k.id) > (p_after_k1, p_after_k2, p_after_k3, p_after_id)
    order by k.k1, k.k2, k.k3, k.id
    limit v_limit
  )
  select
    p.id, p.case_code, p.status, p.incident_type, p.urgency, p.triage_reasons,
    p.system_urgency, p.urgency_override_reason, p.priority_score, p.created_at,
    p.lat, p.lng, p.accuracy_m, p.location_source,
    p.province, p.district, p.subdistrict, p.landmark,
    cp.adults as p_adults, cp.elderly as p_elderly, cp.bedridden as p_bedridden,
    cp.children as p_children, cp.pets as p_pets,
    p.dist, p.k1::text, p.k2::text, p.k3::text, counted.total
  from paged p
  cross join counted
  left join public.case_people cp on cp.case_id = p.id
  order by p.k1, p.k2, p.k3, p.id;
end;
$func$;

comment on function public.list_rescue_cases is
  'รายการเคสที่ยังไม่ปิดสำหรับกู้ภัย (TF-23/TF-27) — RLS ของผู้เรียกทำงาน ไม่มีข้อมูลส่วนตัว เรียง PRIORITY/DISTANCE/WAITING แบ่งหน้า keyset ไม่เกิน 100 แถว';

revoke all on function public.list_rescue_cases(
  double precision, double precision, integer, text, numeric, numeric, numeric, uuid, integer
) from public, anon;
grant execute on function public.list_rescue_cases(
  double precision, double precision, integer, text, numeric, numeric, numeric, uuid, integer
) to authenticated;
