-- ============================================================================
-- TF-26: อัปเดตสถานะและงานของฉัน
--   1. กติกาเปลี่ยนสถานะในฐานข้อมูล (ตรงกับ canTransition ใน src/lib/domain/case-status.ts)
--      ACCEPTED → EN_ROUTE → ON_SITE → AWAITING_CONFIRMATION ทีละขั้น ข้ามขั้น/ถอยหลังไม่ได้
--      ช่องทางพิเศษต้องตั้งค่าเฉพาะ transaction ก่อน update (ผู้ใช้ตั้งเองไม่ได้: ไม่มีสิทธิ์ update cases ตรง)
--        app.case_release           release_case (TF-25) ถอยกลับ NEW
--        app.case_cancel_by_reporter reporter_case 'cancel' (TF-14) ปิดเป็น CANCELLED
--        app.case_close_by_lead      หัวหน้า/แอดมิน/ระบบปิดเคส — TODO(TF-31/TF-58) ยังไม่มีหน้าจอเรียก
--   2. advance_case_status(): RPC เดียวของกู้ภัย/หัวหน้าหน่วย ใช้ version กันกดซ้ำแบบ TF-25 ปิดเคสไม่ได้
--   3. add_case_note(): ใส่โน้ตโดยไม่เปลี่ยนสถานะ
--   4. system_close_cases(): ปิดเคสโดยระบบ (service_role เท่านั้น) — E2E ใช้ล้างเคสทดสอบ
--   5. accept_case / release_case / reporter_case ตั้งค่าช่องทางของตัวเอง
--   6. LINE: ไป AWAITING_CONFIRMATION ส่งแค่ CLOSE_CONFIRM ไม่ส่งข้อความสถานะซ้ำ
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. กติกาเปลี่ยนสถานะ
-- ----------------------------------------------------------------------------
create function public.case_status_transition_allowed(
  p_from public.case_status,
  p_to public.case_status,
  p_release boolean default false,
  p_reporter_cancel boolean default false,
  p_lead_close boolean default false
) returns boolean language sql immutable set search_path = '' as $$
  select case
    when p_from = p_to then true  -- ไม่ได้เปลี่ยนสถานะ (แก้คอลัมน์อื่น)
    when p_from in ('RESOLVED', 'CANCELLED', 'DUPLICATE', 'UNREACHABLE') then false
    when p_to = 'NEW' then p_release and p_from in ('ACCEPTED', 'EN_ROUTE')
    when p_to = 'CANCELLED' then p_reporter_cancel or p_lead_close
    when p_to in ('DUPLICATE', 'UNREACHABLE') then p_lead_close
    -- TODO(TF-58): ผู้แจ้งยืนยัน / ครบ 24 ชม. / คิวหัวหน้า ใช้ app.case_close_by_lead
    when p_to = 'RESOLVED' then p_lead_close and p_from = 'AWAITING_CONFIRMATION'
    else (p_from::text, p_to::text) in (
      ('NEW', 'ACCEPTED'),
      ('ACCEPTED', 'EN_ROUTE'),
      ('EN_ROUTE', 'ON_SITE'),
      ('ON_SITE', 'AWAITING_CONFIRMATION')
    )
  end
$$;

create function public.guard_case_status_transition() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not public.case_status_transition_allowed(
    old.status, new.status,
    coalesce(current_setting('app.case_release', true), '') = 'on',
    coalesce(current_setting('app.case_cancel_by_reporter', true), '') = 'on',
    coalesce(current_setting('app.case_close_by_lead', true), '') = 'on'
  ) then
    raise exception 'invalid case status transition % -> %', old.status, new.status
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger trg_case_status_transition
  before update of status on public.cases
  for each row execute function public.guard_case_status_transition();

-- ----------------------------------------------------------------------------
-- 2. advance_case_status(): กู้ภัยที่รับเคส หรือหัวหน้าของหน่วยที่รับ เลื่อนสถานะทีละขั้น
--    ปลายทางที่เป็นสถานะปิด (RESOLVED/CANCELLED/DUPLICATE/UNREACHABLE) ปฏิเสธเสมอ
--    "ช่วยเสร็จแล้ว" (→ AWAITING_CONFIRMATION) ต้องมีผลและจำนวนคน แล้วขอให้ผู้แจ้งยืนยันทาง LINE
-- ----------------------------------------------------------------------------
create function public.advance_case_status(
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

-- ----------------------------------------------------------------------------
-- 3. add_case_note(): โน้ตระหว่างทำงาน ไม่เปลี่ยนสถานะ (สิทธิ์เดียวกับ advance_case_status)
-- ----------------------------------------------------------------------------
create function public.add_case_note(p_case_id uuid, p_note text)
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
-- 4. system_close_cases(): ปิดเคสโดยระบบ (service_role เท่านั้น ผู้ใช้เรียกไม่ได้)
--    ใช้ล้างเคสทดสอบใน E2E และให้ TF-35/TF-31 ใช้ต่อ — ปิดเป็น RESOLVED ได้เฉพาะจาก AWAITING_CONFIRMATION
-- ----------------------------------------------------------------------------
create function public.system_close_cases(
  p_case_ids uuid[], p_status public.case_status, p_reason text
) returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_count integer;
begin
  if p_status not in ('RESOLVED', 'CANCELLED', 'DUPLICATE', 'UNREACHABLE') then
    raise exception 'status must be a closed status' using errcode = '22023';
  end if;
  if char_length(v_reason) not between 3 and 300 then
    raise exception 'reason must be 3-300 characters' using errcode = '22023';
  end if;
  perform set_config('app.case_close_by_lead', 'on', true);
  with closed as (
    update public.cases c
    set status = p_status, closed_at = now(), last_status_updated_at = now(), version = c.version + 1
    from public.cases b
    where c.id = b.id and c.id = any(p_case_ids)
      and public.case_status_transition_allowed(b.status, p_status, false, false, true)
      and b.status <> p_status
    returning c.id, b.status as from_status
  ), events as (
    insert into public.case_events (case_id, event_type, from_status, to_status, actor_role, note)
    select id,
      (case p_status when 'CANCELLED' then 'CANCELLED' when 'DUPLICATE' then 'MERGED_DUPLICATE'
        when 'UNREACHABLE' then 'MARKED_UNREACHABLE' else 'STATUS_CHANGED' end)::public.case_event_type,
      from_status, p_status, 'SYSTEM', v_reason
    from closed
    returning 1
  )
  select count(*) into v_count from events;
  return v_count;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. ฟังก์ชันเดิมตั้งค่าช่องทางของตัวเอง (เนื้อหาเหมือนเดิม เพิ่มแค่ set_config / แก้คอมเมนต์)
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

-- TF-14
create or replace function public.reporter_case(
  p_case_code text, p_token text, p_action text default 'read', p_payload jsonb default '{}'
) returns jsonb language plpgsql set search_path = public, extensions as $$
declare
  c public.cases%rowtype;
  p public.case_people%rowtype;
  v_before jsonb;
  v_result jsonb;
  v_score integer;
  v_water public.water_level;
  v_from_status public.case_status;
begin
  select * into c from public.cases
    where case_code = upper(btrim(p_case_code)) and tracking_token = p_token
    for update;
  if not found then return null; end if;
  if p_action = 'score_context' then
    return jsonb_build_object(
      'urgency', c.urgency, 'createdAt', c.created_at, 'incidentType', c.incident_type,
      'canSelfEvacuate', coalesce((c.details ->> 'canSelfEvacuate')::boolean, false),
      'dangerSigns', coalesce((select details -> 'dangerSigns' from public.case_sensitive_details where case_id = c.id), '[]'::jsonb),
      'hasDisabled', coalesce((select (details ->> 'hasDisabled')::boolean from public.case_sensitive_details where case_id = c.id), false),
      'hasInjured', coalesce((select (details ->> 'hasInjured')::boolean from public.case_sensitive_details where case_id = c.id), false),
      'needs', coalesce((select jsonb_agg(need) from public.case_needs where case_id = c.id), '[]'::jsonb),
      'overridden', c.urgency_overridden_by is not null);

  end if;
  v_from_status := c.status;
  select * into p from public.case_people where case_id = c.id for update;
  v_before := jsonb_build_object('waterLevel', c.details ->> 'waterLevel', 'notes', coalesce(c.notes, ''),
    'adults', p.adults, 'elderly', p.elderly, 'bedridden', p.bedridden,
    'children', p.children, 'pets', p.pets, 'priorityScore', c.priority_score);
  if p_action <> 'read' then
    if c.status in ('RESOLVED', 'CANCELLED', 'DUPLICATE', 'UNREACHABLE') then
      raise exception 'case closed' using errcode = 'SOS40';
    end if;
    if (p_payload ->> 'version')::integer is distinct from c.version then
      raise exception 'version conflict' using errcode = 'SOS41';
    end if;
    if p_action = 'update' then
      v_water := (p_payload ->> 'waterLevel')::public.water_level;
      if p_payload ->> 'previousUrgency' is distinct from c.urgency::text then
        raise exception 'priority context changed' using errcode = 'SOS41';
      end if;
      v_score := (p_payload ->> 'priorityScore')::integer;
      if v_score is null then
        raise exception 'priority score is required';
      end if;
      update public.case_people set
        adults = (p_payload ->> 'adults')::integer,
        elderly = (p_payload ->> 'elderly')::integer,
        bedridden = (p_payload ->> 'bedridden')::integer,
        children = (p_payload ->> 'children')::integer,
        pets = (p_payload ->> 'pets')::integer
      where case_id = c.id returning * into p;
      update public.cases set details = case
        when v_water is null then c.details - 'waterLevel'
        else jsonb_set(c.details, '{waterLevel}', to_jsonb(v_water), true)
      end,
        notes = nullif(btrim(p_payload ->> 'notes'), ''), priority_score = v_score,
        urgency = case when c.urgency_overridden_by is not null then c.urgency else (p_payload ->> 'urgency')::public.urgency_level end,
        system_urgency = case when c.urgency_overridden_by is not null then (p_payload ->> 'systemUrgency')::public.urgency_level else c.system_urgency end,
        triage_reasons = array(select jsonb_array_elements_text(p_payload -> 'triageReasons')),
        version = version + 1 where id = c.id returning * into c;
    elsif p_action = 'cancel' then
      -- TF-26: ผู้แจ้งกดปลอดภัยแล้ว ปิดเคสได้ทุกสถานะที่ยังเปิด (ค่าอยู่แค่ใน transaction นี้)
      perform set_config('app.case_cancel_by_reporter', 'on', true);
      update public.cases set status = 'CANCELLED', closed_at = now(),
        last_status_updated_at = now(), version = version + 1
        where id = c.id returning * into c;
    else
      raise exception 'invalid action';
    end if;
  end if;
  v_result := jsonb_build_object('version', c.version, 'waterLevel', c.details ->> 'waterLevel',
    'notes', coalesce(c.notes, ''), 'adults', p.adults, 'elderly', p.elderly,
    'bedridden', p.bedridden, 'children', p.children, 'pets', p.pets);
  if p_action <> 'read' then
    insert into public.case_events(case_id, event_type, from_status, to_status, actor_role, metadata)
      values(c.id, (case when p_action = 'cancel' then 'CANCELLED' else 'REPORTER_UPDATED' end)::public.case_event_type,
        v_from_status, c.status, 'GUEST',
        jsonb_build_object('source', 'REPORTER_TRACKING', 'before', v_before,
          'after', v_result || jsonb_build_object('priorityScore', c.priority_score),
          'reason', case when p_action = 'cancel' then 'SAFE' end));
  end if;
  return v_result;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. LINE ถึงผู้แจ้ง: AWAITING_CONFIRMATION ส่งแค่ CLOSE_CONFIRM (จาก advance_case_status) ไม่ส่งข้อความสถานะซ้ำ
-- ----------------------------------------------------------------------------
create or replace function public.enqueue_case_line_notification() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status is distinct from new.status and new.reporter_user_id is not null
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

revoke all on function public.case_status_transition_allowed(public.case_status, public.case_status, boolean, boolean, boolean) from public, anon;
grant execute on function public.case_status_transition_allowed(public.case_status, public.case_status, boolean, boolean, boolean) to authenticated, service_role;
revoke all on function public.advance_case_status(uuid, integer, public.case_status, text, text, integer) from public, anon;
grant execute on function public.advance_case_status(uuid, integer, public.case_status, text, text, integer) to authenticated;
revoke all on function public.add_case_note(uuid, text) from public, anon;
grant execute on function public.add_case_note(uuid, text) to authenticated;
revoke all on function public.system_close_cases(uuid[], public.case_status, text) from public, anon, authenticated;
grant execute on function public.system_close_cases(uuid[], public.case_status, text) to service_role;
