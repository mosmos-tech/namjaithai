-- ============================================================================
-- TF-25: รับเคสและปล่อยเคส
--   1. accept_case(): เช็กสิทธิ์ + เพดาน 2 เคส + เปลี่ยนสถานะ ในฟังก์ชันเดียว
--      ใช้ UPDATE ... WHERE status = 'NEW' AND version = <ที่เห็น> — 2 คนกดพร้อมกันได้คนเดียว
--      (คนที่สองรอ row lock แล้ว Postgres ตรวจ WHERE ซ้ำกับแถวใหม่ จึงได้ 0 แถว)
--      คนกดช้าได้ชื่อหน่วยที่รับไปแล้ว (ไม่มีชื่อคน)
--   2. release_case(): ต้องมีเหตุผล สถานะกลับเป็น NEW ล้างหน่วย/คนที่รับ
--      เคสแดง → เข้าคิวแจ้งเตือนเคสแดงของ TF-34 อีกรอบ ไม่ส่งถึงคนที่เพิ่งปล่อย
--   3. case_detail_permissions() ของ TF-24 บอกหน้าเว็บว่ากดรับ/ปล่อยได้ไหม (กติกาเดียวกับฟังก์ชัน)
-- ทั้งรับและปล่อยบันทึก case_events + audit_logs; สถานะที่เปลี่ยนทำให้ trigger LINE ของ TF-34 เข้าคิวผู้แจ้งเอง
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. หน่วยที่ใช้รับเคส: หน่วยที่หัวหน้ามอบเคสไว้ (ถ้าเป็นหน่วยของตัวเอง) ก่อน
--    ไม่งั้นหน่วยของตัวเองที่ดูแลจังหวัดของเคส · ไม่มี = รับไม่ได้
--    rls.my_unit_ids() = สมาชิกที่อนุมัติแล้ว ไม่หมดอายุ ในหน่วยที่ยังใช้งาน
-- ----------------------------------------------------------------------------
create function public.claim_unit_for_case(p_case_id uuid)
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select un.id
  from public.cases c
  join public.units un on un.id in (select rls.my_unit_ids())
  where c.id = p_case_id
    and (un.id = c.assigned_unit_id or un.province = c.province)
  order by (un.id = c.assigned_unit_id) desc, un.created_at, un.id
  limit 1
$$;

revoke all on function public.claim_unit_for_case(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. รับเคส
-- ----------------------------------------------------------------------------
create function public.accept_case(p_case_id uuid, p_expected_version integer)
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
  -- TODO(TF-58): สถานะ AWAITING_CONFIRMATION (รอผู้แจ้งยืนยันปิดเคส) ไม่ต้องนับในเพดานนี้
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

-- ----------------------------------------------------------------------------
-- 3. คิวเคสแดงของ TF-34: รอบแจ้งเตือน + คนที่ไม่ต้องแจ้ง
--    ปล่อยเคสแดง = รอบใหม่ (alert_round + 1) ตัวกันซ้ำ 10 นาทีเทียบเฉพาะรอบเดียวกัน จึงไม่บล็อกรอบใหม่
-- ----------------------------------------------------------------------------
alter table public.line_red_case_queue
  add column alert_round integer not null default 0,
  add column exclude_user_id uuid references public.users(id) on delete set null;
alter table public.case_line_notifications
  add column alert_round integer not null default 0;

create or replace function public.skip_duplicate_case_line_notification() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (
    select 1 from public.case_line_notifications n
    where n.kind = new.kind and n.case_id = new.case_id and n.user_id = new.user_id
      and n.to_status is not distinct from new.to_status
      and n.alert_round = new.alert_round
      and n.created_at > now() - interval '10 minutes'
  ) then
    return null;
  end if;
  return new;
end;
$$;

-- เหมือน TF-34 + ไม่รวมคนที่เพิ่งปล่อยเคสนี้
create or replace function public.list_red_alert_candidates(p_case_id uuid)
returns table(unit_id uuid, capabilities text[], user_id uuid)
language sql stable set search_path = '' as $$
  select un.id,
    coalesce((select array_agg(uc.capability order by uc.capability)
              from public.unit_capabilities uc where uc.unit_id = un.id), '{}'),
    u.id
  from public.cases c
  join public.units un on un.is_active and un.province = c.province
    and (un.district is null or c.district is null or un.district = c.district)
  join public.unit_members m on m.unit_id = un.id and m.status = 'APPROVED'
    and (m.expires_at is null or m.expires_at > now())
    and m.is_on_duty and m.duty_status <> 'OFFLINE'
  join public.users u on u.id = m.user_id and u.status = 'ACTIVE'
    and u.line_user_id ~ '^U[0-9a-fA-F]{32}$'
  left join public.line_red_case_queue q on q.case_id = c.id
  where c.id = p_case_id and u.id is distinct from c.reporter_user_id
    and u.id is distinct from q.exclude_user_id
  order by un.created_at, un.id, m.approved_at nulls last, u.id
$$;

-- เหมือน TF-34 + ใส่รอบแจ้งเตือน และกันคนที่เพิ่งปล่อยอีกชั้น
create or replace function public.enqueue_red_alerts(p_case_id uuid, p_user_ids uuid[])
returns integer
language plpgsql set search_path = '' as $$
declare
  v_count integer;
  v_round integer;
  v_exclude uuid;
begin
  select q.alert_round, q.exclude_user_id into v_round, v_exclude
  from public.line_red_case_queue q where q.case_id = p_case_id;
  insert into public.case_line_notifications(kind, case_id, user_id, alert_round)
    select 'RED_ALERT', p_case_id, x, coalesce(v_round, 0)
    from unnest((coalesce(p_user_ids, '{}'))[1:10]) as x
    where x is distinct from v_exclude;
  get diagnostics v_count = row_count;
  update public.line_red_case_queue set processed_at = now() where case_id = p_case_id;
  return v_count;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. ปล่อยเคส
-- ----------------------------------------------------------------------------
create function public.release_case(p_case_id uuid, p_expected_version integer, p_reason text)
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

revoke all on function public.accept_case(uuid, integer) from public, anon;
revoke all on function public.release_case(uuid, integer, text) from public, anon;
grant execute on function public.accept_case(uuid, integer) to authenticated;
grant execute on function public.release_case(uuid, integer, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. สิทธิ์บนหน้ารายละเอียดเคส (TF-24) + ปุ่มรับ/ปล่อย
-- ----------------------------------------------------------------------------
create or replace function public.case_detail_permissions(p_case_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := rls.current_user_id();
  item public.cases%rowtype;
  is_admin boolean := rls.is_admin();
  has_unit boolean := exists (select 1 from rls.my_unit_ids());
begin
  if actor is null or (not is_admin and not has_unit) or not rls.can_see_case(p_case_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into item from public.cases where id = p_case_id;
  if not found then raise exception 'not authorized' using errcode = '42501'; end if;
  return jsonb_build_object(
    'contact', is_admin or (has_unit and item.assigned_rescuer_id = actor),
    'override', (is_admin or item.assigned_rescuer_id = actor or item.assigned_unit_id in (select rls.my_unit_ids(true)))
      and item.status in ('NEW', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE'),
    'accept', not is_admin and item.status = 'NEW' and public.claim_unit_for_case(p_case_id) is not null,
    'release', item.status in ('ACCEPTED', 'EN_ROUTE')
      and (is_admin or item.assigned_rescuer_id = actor or item.assigned_unit_id in (select rls.my_unit_ids(true)))
  );
end $$;
