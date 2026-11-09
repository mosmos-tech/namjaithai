-- TF-29: การมอบหมายต้องผ่าน RPC เพื่อบังคับสิทธิ์ เพดาน และ audit ใน transaction เดียว
revoke update (assigned_unit_id, assigned_rescuer_id) on public.cases from authenticated;

create function public.case_assignment_options(p_case_id uuid)
returns table(unit_id uuid, unit_name text, user_id uuid, display_name text)
language sql stable security definer set search_path = '' as $$
  select un.id, un.name, u.id, u.display_name
  from public.cases c
  join public.units un on un.id in (select rls.my_unit_ids(true))
    and ((c.status = 'NEW' and c.assigned_unit_id is null and c.province = un.province)
         or c.assigned_unit_id = un.id)
  join public.unit_members m on m.unit_id = un.id and m.status = 'APPROVED'
    and (m.expires_at is null or m.expires_at > now())
  join public.users u on u.id = m.user_id and u.status = 'ACTIVE' and u.role in ('RESCUER','UNIT_LEAD')
  where c.id = p_case_id and c.status in ('NEW','ACCEPTED','EN_ROUTE','ON_SITE')
    and rls.current_user_id() is not null
  order by un.name, u.display_name, u.id
$$;

create function public.assign_case(p_case_id uuid, p_unit_id uuid, p_rescuer_id uuid, p_expected_version integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := rls.current_user_id();
  v_before public.cases%rowtype;
  v_case public.cases%rowtype;
  v_active integer;
begin
  if v_actor is null or p_unit_id is null or p_rescuer_id is null or not (p_unit_id in (select rls.my_unit_ids(true))) then
    raise exception 'not a lead of this unit' using errcode = '42501';
  end if;
  -- ใช้ lock เดียวกับ accept_case เพื่อไม่ให้มอบหมายพร้อมรับเคสจนเกินเพดาน
  perform pg_advisory_xact_lock(hashtextextended('tf25-rescuer:' || p_rescuer_id::text, 0));
  -- ตรงกับ TF-30 (หน่วยก่อนสมาชิก) และ TF-20 (สมาชิกก่อน users)
  perform 1 from public.units where id = p_unit_id and is_active for share;
  if not found then raise exception 'unit inactive' using errcode = '42501'; end if;
  perform 1 from public.unit_members where unit_id = p_unit_id and user_id in (v_actor,p_rescuer_id)
    order by user_id for share;
  perform 1 from public.users where id in (v_actor,p_rescuer_id) order by id for share;
  if not exists (select 1 from public.users where id = v_actor and status = 'ACTIVE') or not exists (
    select 1 from public.unit_members where unit_id = p_unit_id and user_id = v_actor
      and role_in_unit = 'LEAD' and status = 'APPROVED' and (expires_at is null or expires_at > now())
  ) then raise exception 'not a lead of this unit' using errcode = '42501'; end if;
  if not exists (select 1 from public.users where id = p_rescuer_id and status = 'ACTIVE'
    and role in ('RESCUER','UNIT_LEAD')) or not exists (
    select 1 from public.unit_members where unit_id = p_unit_id and user_id = p_rescuer_id
      and status = 'APPROVED' and (expires_at is null or expires_at > now())
  ) then raise exception 'rescuer is not an active member of this unit' using errcode = '42501'; end if;
  select * into v_before from public.cases where id = p_case_id for update;
  if not found or not rls.can_see_case(p_case_id) or (
    (v_before.status = 'NEW' and v_before.assigned_unit_id is null and v_before.province =
      (select province from public.units where id = p_unit_id))
    or v_before.assigned_unit_id = p_unit_id
  ) is not true then
    raise exception 'case is not assignable by this unit' using errcode = '42501';
  end if;
  if v_before.version is distinct from p_expected_version or v_before.status not in ('NEW','ACCEPTED','EN_ROUTE','ON_SITE') then
    return jsonb_build_object('status','STALE','version',v_before.version);
  end if;
  if v_before.assigned_rescuer_id = p_rescuer_id then
    return jsonb_build_object('status','UNCHANGED','version',v_before.version);
  end if;
  select count(*) into v_active from public.cases
  where assigned_rescuer_id = p_rescuer_id and status in ('ACCEPTED','EN_ROUTE','ON_SITE');
  if v_active >= 2 then return jsonb_build_object('status','LIMIT','max',2); end if;

  update public.cases c set assigned_unit_id = p_unit_id, assigned_rescuer_id = p_rescuer_id,
    status = case when c.status = 'NEW' then 'ACCEPTED'::public.case_status else c.status end,
    accepted_at = case when c.status = 'NEW' then now() else c.accepted_at end,
    last_status_updated_at = case when c.status = 'NEW' then now() else c.last_status_updated_at end,
    version = c.version + 1
  where c.id = p_case_id returning * into v_case;
  insert into public.case_events(case_id,event_type,from_status,to_status,actor_user_id,actor_unit_id,actor_role,metadata)
  values (v_case.id,'ASSIGNED',v_before.status,v_case.status,v_actor,p_unit_id,'UNIT_LEAD',
    jsonb_build_object('rescuer_id',p_rescuer_id,'previous_rescuer_id',v_before.assigned_rescuer_id,'version',v_case.version));
  insert into public.audit_logs(actor_user_id,action,target_type,target_id,case_id,metadata)
  values (v_actor,'CASE_ASSIGNED','case',v_case.id,v_case.id,
    jsonb_build_object('unit_id',p_unit_id,'rescuer_id',p_rescuer_id,'previous_rescuer_id',v_before.assigned_rescuer_id));
  return jsonb_build_object('status','ASSIGNED','version',v_case.version);
end $$;

revoke all on function public.case_assignment_options(uuid) from public, anon;
revoke all on function public.assign_case(uuid,uuid,uuid,integer) from public, anon;
grant execute on function public.case_assignment_options(uuid) to authenticated;
grant execute on function public.assign_case(uuid,uuid,uuid,integer) to authenticated;
