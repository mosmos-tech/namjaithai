-- ============================================================================
-- TF-70: แยกเคสตัวอย่าง (cases.is_demo = true) ออกจากงานจริงทุกจุด
--   ยังแสดงได้: ผลงานหน่วย (unit_daily_stats / unit_monthly_stats / public_unit_daily_helped) ที่มีป้าย "ข้อมูลตัวอย่าง"
--   1. RLS "read visible cases" + rls.can_see_case: ผู้ใช้ที่ไม่ใช่แอดมินมองไม่เห็นเคสตัวอย่าง
--      → รายการ/แผนที่ (list_rescue_cases เป็น security invoker), Realtime (ส่งตาม RLS), หน้ารายละเอียด, งานของฉัน
--   2. list_rescue_cases ไม่คืนเคสตัวอย่าง (รวมแอดมิน)
--   3. accept_case / release_case / advance_case_status / add_case_note ปฏิเสธเคสตัวอย่าง (22023)
--   4. trigger LINE (สถานะเปลี่ยน, เคสแดงใหม่) และ enqueue_close_confirmation ไม่เข้าคิว
--   5. คิวหัวหน้า (TF-58) และคิวตรวจผลงานติดด่าน (TF-57) ไม่มีเคสตัวอย่าง
--   6. ห้ามเปลี่ยน is_demo หลังสร้างเคส (trigger LINE ตัดสินจากค่าตอน insert)
-- เนื้อหาฟังก์ชันคัดจากเวอร์ชันล่าสุด เพิ่มแค่บรรทัดที่มีคอมเมนต์ TF-70 (สิทธิ์ grant เดิมคงอยู่กับ create or replace)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. สิทธิ์อ่านเคส
-- ----------------------------------------------------------------------------
drop policy if exists "read visible cases" on public.cases;
create policy "read visible cases" on public.cases
  for select to authenticated
  using (
    (select rls.is_admin())
    or (
      not is_demo -- TF-70: เคสตัวอย่างเห็นได้เฉพาะแอดมิน
      and (
        reporter_user_id = (select rls.current_user_id())
        or (
          assigned_rescuer_id = (select rls.current_user_id())
          and exists (select 1 from rls.my_unit_ids())
        )
        or assigned_unit_id in (select rls.my_unit_ids())
        or province in (select rls.my_provinces())
      )
    )
  );

create or replace function rls.can_see_case(p_case_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select rls.is_admin() or exists (
    select 1 from public.cases c
    where c.id = p_case_id
      and not c.is_demo -- TF-70: เคสตัวอย่างเห็นได้เฉพาะแอดมิน
      and (
        c.reporter_user_id = rls.current_user_id()
        or (
          c.assigned_rescuer_id = rls.current_user_id()
          and exists (select 1 from rls.my_unit_ids())
        )
        or c.assigned_unit_id in (select rls.my_unit_ids())
        or c.province in (select rls.my_provinces())
      )
  )
$$;

-- ----------------------------------------------------------------------------
-- 2. รายการ/แผนที่กู้ภัย
-- ----------------------------------------------------------------------------
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
      and not c.is_demo -- TF-70: เคสตัวอย่างไม่ขึ้นรายการ/แผนที่ของกู้ภัย (รวมแอดมิน)
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

-- ----------------------------------------------------------------------------
-- 3. รับ/ปล่อย/เลื่อนสถานะ/โน้ต
-- ----------------------------------------------------------------------------
create or replace function public.accept_case(p_case_id uuid, p_expected_version integer)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  c_max_active constant integer := 2;
  v_actor uuid := rls.current_user_id();
  v_unit uuid;
  v_case public.cases%rowtype;
  v_active integer;
  v_holder text;
begin
  -- security definer ข้าม RLS: ต้องเช็กว่ามองเห็นเคสนี้จริง (รู้ id อย่างเดียวไม่พอ)
  if v_actor is null or not rls.can_see_case(p_case_id) then
    raise exception 'case not found' using errcode = '42501';
  end if;
  -- TF-70: เคสตัวอย่าง (is_demo) แยกจากงานจริง รับ/ปล่อย/เลื่อนสถานะ/ใส่โน้ตไม่ได้
  if exists (select 1 from public.cases d where d.id = p_case_id and d.is_demo) then
    raise exception 'demo case' using errcode = '22023';
  end if;
  -- แอดมินไม่รับเคสเอง ใช้มอบหมายแทน
  if rls.is_admin() then
    raise exception 'admins assign cases instead of accepting' using errcode = '42501';
  end if;
  v_unit := public.claim_unit_for_case(p_case_id);
  if v_unit is null then
    raise exception 'not a member of a unit covering this case' using errcode = '42501';
  end if;

  -- เพดานเคสค้างต่อคน: ล็อกตามคนก่อนนับ กันกดรับ 2 เคสพร้อมกันแล้วนับได้ 1 ทั้งคู่จนเกิน
  perform pg_advisory_xact_lock(hashtextextended('tf25-rescuer:' || v_actor::text, 0));
  -- TF-26: นับเฉพาะเคสที่ยังต้องลงมือ — AWAITING_CONFIRMATION (ช่วยเสร็จแล้ว รอผู้แจ้งยืนยัน) ไม่นับ
  select count(*) into v_active
  from public.cases c
  where c.assigned_rescuer_id = v_actor and c.status in ('ACCEPTED', 'EN_ROUTE', 'ON_SITE');
  if v_active >= c_max_active then
    return jsonb_build_object('status', 'LIMIT', 'max', c_max_active);
  end if;

  -- เช็กและเปลี่ยนในคำสั่งเดียว (ห้ามแยกอ่านแล้วค่อยเขียน)
  update public.cases c
  set status = 'ACCEPTED',
      assigned_rescuer_id = v_actor,
      assigned_unit_id = v_unit,
      accepted_at = now(),
      last_status_updated_at = now(),
      version = c.version + 1
  where c.id = p_case_id and c.status = 'NEW' and c.version = p_expected_version
  returning * into v_case;

  if not found then
    select * into v_case from public.cases c where c.id = p_case_id;
    if v_case.status <> 'NEW' then
      -- คนกดช้า: บอกแค่ชื่อหน่วย ไม่มีชื่อคน
      select un.name into v_holder from public.units un where un.id = v_case.assigned_unit_id;
      return jsonb_build_object('status', 'TAKEN', 'unitName', v_holder);
    end if;
    -- ยังเป็น NEW แต่ version เปลี่ยน (เช่น มีคนปรับระดับความเร่งด่วน) → ให้หน้าเว็บโหลดใหม่แล้วกดอีกครั้ง
    return jsonb_build_object('status', 'STALE', 'version', v_case.version);
  end if;

  insert into public.case_events (
    case_id, event_type, from_status, to_status, actor_user_id, actor_unit_id, actor_role, metadata
  )
  values (
    v_case.id, 'ACCEPTED', 'NEW', 'ACCEPTED', v_actor, v_unit, 'RESCUER',
    jsonb_build_object('version', v_case.version)
  );
  insert into public.audit_logs (actor_user_id, action, target_type, target_id, case_id, metadata)
  values (v_actor, 'CASE_ACCEPTED', 'case', v_case.id, v_case.id, jsonb_build_object('unit_id', v_unit));

  return jsonb_build_object('status', 'ACCEPTED', 'version', v_case.version);
end;
$$;

create or replace function public.release_case(p_case_id uuid, p_expected_version integer, p_reason text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := rls.current_user_id();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_before public.cases%rowtype;
  v_case public.cases%rowtype;
begin
  if v_actor is null or not rls.can_see_case(p_case_id) then
    raise exception 'case not found' using errcode = '42501';
  end if;
  -- TF-70: เคสตัวอย่าง (is_demo) แยกจากงานจริง รับ/ปล่อย/เลื่อนสถานะ/ใส่โน้ตไม่ได้
  if exists (select 1 from public.cases d where d.id = p_case_id and d.is_demo) then
    raise exception 'demo case' using errcode = '22023';
  end if;
  -- ความยาวตรงกับ caseReleaseReasonSchema ใน src/lib/domain
  if char_length(v_reason) not between 3 and 300 then
    raise exception 'release reason must be 3-300 characters' using errcode = '22023';
  end if;

  select * into v_before from public.cases c where c.id = p_case_id;
  -- ปล่อยได้: คนที่รับเคส / หัวหน้าของหน่วยที่รับ / แอดมิน — สมาชิกคนอื่นและคนนอกหน่วยไม่ได้
  if not (
    rls.is_admin()
    or (v_before.assigned_rescuer_id = v_actor and exists (select 1 from rls.my_unit_ids()))
    or v_before.assigned_unit_id in (select rls.my_unit_ids(true))
  ) then
    raise exception 'not allowed to release this case' using errcode = '42501';
  end if;

  -- ถอยกลับ NEW ได้จาก ACCEPTED / EN_ROUTE เท่านั้น (ตรงกับ canTransition ใน src/lib/domain)
  -- TF-26: บอก trigger ว่าเป็นการปล่อยเคส (ค่าอยู่แค่ใน transaction นี้)
  perform set_config('app.case_release', 'on', true);
  update public.cases c
  set status = 'NEW',
      assigned_rescuer_id = null,
      assigned_unit_id = null,
      accepted_at = null,
      last_status_updated_at = now(),
      version = c.version + 1
  where c.id = p_case_id
    and c.status in ('ACCEPTED', 'EN_ROUTE')
    and c.version = p_expected_version
  returning * into v_case;

  if not found then
    return jsonb_build_object('status', 'STALE', 'version', v_before.version);
  end if;

  insert into public.case_events (
    case_id, event_type, from_status, to_status, actor_user_id, actor_unit_id, actor_role, note, metadata
  )
  values (
    v_case.id, 'RELEASED', v_before.status, 'NEW', v_actor, v_before.assigned_unit_id,
    case when rls.is_admin() then 'ADMIN' when v_before.assigned_rescuer_id = v_actor then 'RESCUER' else 'UNIT_LEAD' end,
    v_reason,
    jsonb_build_object('version', v_case.version, 'released_rescuer_id', v_before.assigned_rescuer_id)
  );
  insert into public.audit_logs (actor_user_id, action, target_type, target_id, case_id, metadata)
  values (
    v_actor, 'CASE_RELEASED', 'case', v_case.id, v_case.id,
    jsonb_build_object('unit_id', v_before.assigned_unit_id, 'rescuer_id', v_before.assigned_rescuer_id)
  );

  -- เคสแดงกลับมารอ: ปลุกกู้ภัยในพื้นที่อีกรอบ ยกเว้นคนที่เพิ่งปล่อย (ครอบ exception: คิวพลาด การปล่อยยังสำเร็จ)
  if v_case.urgency = 'RED' then
    begin
      insert into public.line_red_case_queue as q (case_id, alert_round, exclude_user_id)
      values (v_case.id, 1, v_before.assigned_rescuer_id)
      on conflict (case_id) do update
        set processed_at = null,
            created_at = now(),
            alert_round = q.alert_round + 1,
            exclude_user_id = excluded.exclude_user_id;
    exception when others then
      raise warning 'red case re-alert enqueue failed: %', sqlerrm;
    end;
  end if;

  return jsonb_build_object('status', 'RELEASED', 'version', v_case.version);
end;
$$;

create or replace function public.advance_case_status(
  p_case_id uuid,
  p_expected_version integer,
  p_to_status public.case_status,
  p_note text default null,
  p_outcome text default null,
  p_people_helped integer default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := rls.current_user_id();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_before public.cases%rowtype;
  v_case public.cases%rowtype;
  v_role text;
  v_metadata jsonb;
  v_version integer;
begin
  -- security definer ข้าม RLS: ต้องเช็กว่ามองเห็นเคสนี้จริง
  if v_actor is null or not rls.can_see_case(p_case_id) then
    raise exception 'case not found' using errcode = '42501';
  end if;
  -- TF-70: เคสตัวอย่าง (is_demo) แยกจากงานจริง รับ/ปล่อย/เลื่อนสถานะ/ใส่โน้ตไม่ได้
  if exists (select 1 from public.cases d where d.id = p_case_id and d.is_demo) then
    raise exception 'demo case' using errcode = '22023';
  end if;
  select * into v_before from public.cases c where c.id = p_case_id;

  -- เฉพาะคนที่รับเคส (ยังเป็นสมาชิกหน่วย) หรือหัวหน้าของหน่วยที่รับ — แอดมินมอบหมายแทน ไม่เลื่อนสถานะเอง
  if v_before.assigned_rescuer_id = v_actor and exists (select 1 from rls.my_unit_ids()) then
    v_role := 'RESCUER';
  elsif v_before.assigned_unit_id in (select rls.my_unit_ids(true)) then
    v_role := 'UNIT_LEAD';
  else
    raise exception 'not allowed to update this case' using errcode = '42501';
  end if;

  -- กู้ภัย/หัวหน้าปิดเคสผ่านทางนี้ไม่ได้ (ผู้แจ้งยืนยัน / หัวหน้าปิด เป็นงาน TF-58 / TF-31)
  if p_to_status in ('NEW', 'RESOLVED', 'CANCELLED', 'DUPLICATE', 'UNREACHABLE') then
    raise exception 'status % is not allowed here', p_to_status using errcode = '22023';
  end if;
  if char_length(coalesce(v_note, '')) > 500 then
    raise exception 'note must be at most 500 characters' using errcode = '22023';
  end if;

  if p_to_status = 'AWAITING_CONFIRMATION' then
    -- ตรงกับ caseCompletionSchema ใน src/lib/domain
    if p_outcome is null or p_outcome not in ('HELPED', 'HOSPITAL', 'OTHER') then
      raise exception 'outcome is required' using errcode = '22023';
    end if;
    if p_people_helped is null or p_people_helped not between 0 and 999 then
      raise exception 'people helped must be 0-999' using errcode = '22023';
    end if;
    if p_outcome = 'OTHER' and v_note is null then
      raise exception 'note is required for OTHER' using errcode = '22023';
    end if;
  elsif p_outcome is not null or p_people_helped is not null then
    raise exception 'outcome only applies when finishing' using errcode = '22023';
  end if;

  -- ทีละขั้นจากสถานะที่เห็นอยู่ (trigger ตรวจซ้ำอีกชั้น) — ข้ามขั้น = INVALID ไม่ใช่ STALE
  if not public.case_status_transition_allowed(v_before.status, p_to_status)
     or v_before.status = p_to_status then
    if v_before.version <> p_expected_version then
      return jsonb_build_object('status', 'STALE', 'version', v_before.version);
    end if;
    raise exception 'invalid case status transition % -> %', v_before.status, p_to_status
      using errcode = '23514';
  end if;

  -- เช็กและเปลี่ยนในคำสั่งเดียว: กดซ้ำ/กดพร้อมกัน คนที่สองได้ 0 แถว (แบบ accept_case)
  update public.cases c
  set status = p_to_status,
      last_status_updated_at = now(),
      version = c.version + 1
  where c.id = p_case_id and c.status = v_before.status and c.version = p_expected_version
  returning * into v_case;
  if not found then
    select c.version into v_version from public.cases c where c.id = p_case_id;
    return jsonb_build_object('status', 'STALE', 'version', v_version);
  end if;

  v_metadata := jsonb_build_object('version', v_case.version)
    || case when p_to_status = 'AWAITING_CONFIRMATION'
         then jsonb_build_object('outcome', p_outcome, 'peopleHelped', p_people_helped)
         else '{}'::jsonb end;
  insert into public.case_events (
    case_id, event_type, from_status, to_status, actor_user_id, actor_unit_id, actor_role, note, metadata
  )
  values (
    v_case.id, 'STATUS_CHANGED', v_before.status, v_case.status, v_actor, v_case.assigned_unit_id,
    v_role, v_note, v_metadata
  );
  insert into public.audit_logs (actor_user_id, action, target_type, target_id, case_id, metadata)
  values (
    v_actor, 'CASE_STATUS_CHANGED', 'case', v_case.id, v_case.id,
    v_metadata || jsonb_build_object('from', v_before.status, 'to', v_case.status)
  );

  -- ขอให้ผู้แจ้งยืนยันปิดเคสทาง LINE (คิวของ TF-34) — คิวพลาด การเปลี่ยนสถานะยังสำเร็จ
  -- TODO(TF-58): ผู้แจ้งกดยืนยัน / ครบ 24 ชม. ปิดเป็น RESOLVED / คิวหัวหน้า
  if v_case.status = 'AWAITING_CONFIRMATION' then
    begin
      perform public.enqueue_close_confirmation(v_case.id);
    exception when others then
      raise warning 'close confirmation enqueue failed: %', sqlerrm;
    end;
  end if;

  return jsonb_build_object('status', 'UPDATED', 'version', v_case.version, 'to', v_case.status);
end;
$$;

create or replace function public.add_case_note(p_case_id uuid, p_note text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := rls.current_user_id();
  v_note text := btrim(coalesce(p_note, ''));
  v_case public.cases%rowtype;
  v_role text;
begin
  if v_actor is null or not rls.can_see_case(p_case_id) then
    raise exception 'case not found' using errcode = '42501';
  end if;
  -- TF-70: เคสตัวอย่าง (is_demo) แยกจากงานจริง รับ/ปล่อย/เลื่อนสถานะ/ใส่โน้ตไม่ได้
  if exists (select 1 from public.cases d where d.id = p_case_id and d.is_demo) then
    raise exception 'demo case' using errcode = '22023';
  end if;
  if char_length(v_note) not between 1 and 500 then
    raise exception 'note must be 1-500 characters' using errcode = '22023';
  end if;
  select * into v_case from public.cases c where c.id = p_case_id;
  if v_case.assigned_rescuer_id = v_actor and exists (select 1 from rls.my_unit_ids()) then
    v_role := 'RESCUER';
  elsif v_case.assigned_unit_id in (select rls.my_unit_ids(true)) then
    v_role := 'UNIT_LEAD';
  else
    raise exception 'not allowed to update this case' using errcode = '42501';
  end if;
  if v_case.status not in ('ACCEPTED', 'EN_ROUTE', 'ON_SITE', 'AWAITING_CONFIRMATION') then
    raise exception 'case is not in progress' using errcode = '22023';
  end if;
  insert into public.case_events (
    case_id, event_type, from_status, to_status, actor_user_id, actor_unit_id, actor_role, note
  )
  values (v_case.id, 'NOTE_ADDED', v_case.status, v_case.status, v_actor, v_case.assigned_unit_id, v_role, v_note);
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. LINE
-- ----------------------------------------------------------------------------
create or replace function public.enqueue_case_line_notification() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status is distinct from new.status and new.reporter_user_id is not null
     and not new.is_demo -- TF-70
     and new.status <> 'AWAITING_CONFIRMATION' then
    begin
      insert into public.case_line_notifications(case_id, user_id, to_status)
        select new.id, u.id, new.status from public.users u
        where u.id = new.reporter_user_id and u.status = 'ACTIVE' and u.line_user_id ~ '^U[0-9a-fA-F]{32}$';
    exception when others then
      raise warning 'line notification enqueue failed: %', sqlerrm;
    end;
  end if;
  return new;
end;
$$;

create or replace function public.enqueue_red_case_alert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.urgency = 'RED' and new.status = 'NEW' and not new.is_demo -- TF-70
     and (tg_op = 'INSERT' or old.urgency is distinct from 'RED') then
    begin
      insert into public.line_red_case_queue(case_id) values (new.id) on conflict (case_id) do nothing;
    exception when others then
      raise warning 'red case alert enqueue failed: %', sqlerrm;
    end;
  end if;
  return new;
end;
$$;

create or replace function public.enqueue_close_confirmation(p_case_id uuid)
returns boolean language plpgsql set search_path = '' as $$
begin
  insert into public.case_line_notifications(kind, case_id, user_id)
    select 'CLOSE_CONFIRM', c.id, u.id
    from public.cases c join public.users u on u.id = c.reporter_user_id
    where c.id = p_case_id and not c.is_demo and u.status = 'ACTIVE' -- TF-70: not is_demo
      and u.line_user_id ~ '^U[0-9a-fA-F]{32}$';
  return found;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. คิวหัวหน้า (TF-58) และคิวตรวจผลงาน (TF-57)
-- ----------------------------------------------------------------------------
create or replace function public.lead_confirmation_queue()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if rls.current_user_id() is null or (not rls.is_admin() and not exists(select 1 from rls.my_unit_ids(true))) then
    raise exception 'forbidden' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at), '[]'::jsonb) into result from (
    select c.id, c.case_code, c.assigned_unit_id as unit_id, 'OVERDUE'::text as kind, c.last_status_updated_at as created_at
    from public.cases c where c.status='AWAITING_CONFIRMATION' and not c.is_demo and c.last_status_updated_at <= now()-interval '24 hours'
      and (rls.is_admin() or c.assigned_unit_id in (select rls.my_unit_ids(true)))
    union all
    select c.id, c.case_code, a.unit_id, 'NOT_RECEIVED'::text, a.created_at
    from public.case_lead_alerts a join public.cases c on c.id=a.case_id
    where a.acknowledged_at is null and not c.is_demo and (rls.is_admin() or a.unit_id in (select rls.my_unit_ids(true)))
  ) q;
  return result;
end $$;

create or replace function public.pending_performance_reviews()
returns table(case_id uuid, case_code text, unit_id uuid, unit_name text, reasons text[], created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not rls.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return query
    select r.case_id, c.case_code, r.unit_id, u.name, r.reasons, r.created_at
    from public.case_performance_reviews r
    join public.cases c on c.id = r.case_id
    join public.units u on u.id = r.unit_id
    where r.status = 'PENDING' and not c.is_demo -- TF-70
    order by r.created_at;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. is_demo เปลี่ยนไม่ได้หลังสร้างเคส
-- ----------------------------------------------------------------------------
create function public.guard_case_is_demo() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.is_demo is distinct from old.is_demo then
    raise exception 'cases.is_demo cannot change after insert' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_case_is_demo() from public, anon, authenticated;
create trigger trg_case_is_demo_immutable
  before update of is_demo on public.cases
  for each row execute function public.guard_case_is_demo();
