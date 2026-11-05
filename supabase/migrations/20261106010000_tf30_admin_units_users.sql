-- TF-30: administrator actions are transactional, authorized in the database, and audited.
create table public.unit_capabilities (
  unit_id uuid not null references public.units(id) on delete cascade,
  capability text not null check (capability in ('BOAT','EMS','FIRE_SUPPRESSION','EXTRICATION','WATER_RESCUE','ANIMAL_CAPTURE','EVACUATION')),
  primary key (unit_id, capability)
);
alter table public.unit_capabilities enable row level security;
grant select on public.unit_capabilities to authenticated;
create policy "members and admins read unit capabilities" on public.unit_capabilities for select to authenticated
  using (rls.is_admin() or unit_id in (select rls.my_unit_ids()));

create or replace function public.admin_manage(p_action text, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := rls.current_user_id();
  v_unit uuid;
  v_user uuid;
  v_previous_leader uuid;
  v_previous text;
  v_status public.user_status;
  v_code text;
  v_enabled boolean;
  v_caps text[];
begin
  if not rls.is_admin() then raise exception 'admin required' using errcode = '42501'; end if;
  if p_action = 'create_unit' then
    if nullif(btrim(p_input->>'name'), '') is null or length(p_input->>'name') > 150
      or not exists (select 1 from public.provinces where name_th = p_input->>'province') then
      raise exception 'invalid unit' using errcode = '22023';
    end if;
    insert into public.units(name, province) values(btrim(p_input->>'name'), p_input->>'province') returning id into v_unit;
    insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
      values(v_actor, 'UNIT_CREATED', 'unit', v_unit, jsonb_build_object('name', btrim(p_input->>'name'), 'province', p_input->>'province'));
    if nullif(p_input->>'leaderId','') is not null then
      perform public.admin_manage('assign_leader', jsonb_build_object('unitId', v_unit, 'userId', p_input->>'leaderId'));
    end if;
    return jsonb_build_object('unitId', v_unit);
  elsif p_action = 'assign_leader' then
    v_unit := (p_input->>'unitId')::uuid; v_user := (p_input->>'userId')::uuid;
    if not exists (select 1 from public.units where id=v_unit and is_active)
      or not exists (select 1 from public.users where id=v_user and status='ACTIVE') then
      raise exception 'invalid unit or user' using errcode = '22023';
    end if;
    select lead_user_id into v_previous_leader from public.units where id=v_unit for update;
    update public.unit_members set role_in_unit='MEMBER'
      where unit_id=v_unit and role_in_unit='LEAD' and user_id <> v_user;
    update public.users u set role = case when exists (
      select 1 from public.unit_members m join public.units un on un.id=m.unit_id and un.is_active
      where m.user_id=u.id and m.status='APPROVED' and (m.expires_at is null or m.expires_at > now())
    ) then 'RESCUER'::public.user_role else 'USER'::public.user_role end
    where u.role='UNIT_LEAD' and u.id <> v_user
      and exists (select 1 from public.unit_members m where m.unit_id=v_unit and m.user_id=u.id)
      and not exists (select 1 from public.unit_members m join public.units un on un.id=m.unit_id and un.is_active
        where m.user_id=u.id and m.role_in_unit='LEAD' and m.status='APPROVED'
          and (m.expires_at is null or m.expires_at > now()));
    insert into public.unit_members(unit_id,user_id,role_in_unit,status,approved_by)
      values(v_unit,v_user,'LEAD','APPROVED',v_actor)
      on conflict(unit_id,user_id) do update set role_in_unit='LEAD', status='APPROVED', approved_by=v_actor;
    update public.users set role='UNIT_LEAD' where id=v_user and role <> 'ADMIN';
    update public.units set lead_user_id=v_user where id=v_unit;
    insert into public.audit_logs(actor_user_id,action,target_type,target_id,target_user_id,metadata)
      values(v_actor,'UNIT_LEADER_ASSIGNED','unit',v_unit,v_user,jsonb_build_object('previous_leader_id',v_previous_leader));
    return jsonb_build_object('unitId',v_unit,'userId',v_user);
  elsif p_action = 'user_status' then
    v_user := (p_input->>'userId')::uuid;
    if p_input->>'status' not in ('ACTIVE','SUSPENDED') then raise exception 'invalid status' using errcode='22023'; end if;
    v_status := (p_input->>'status')::public.user_status;
    select status::text into v_previous from public.users where id=v_user for update;
    if not found then raise exception 'user missing' using errcode='22023'; end if;
    update public.users set status=v_status where id=v_user;
    insert into public.audit_logs(actor_user_id,action,target_type,target_id,target_user_id,metadata)
      values(v_actor,'USER_STATUS_CHANGED','user',v_user,v_user,jsonb_build_object('from',v_previous,'to',v_status));
    return jsonb_build_object('userId',v_user,'status',v_status);
  elsif p_action = 'capabilities' then
    v_unit := (p_input->>'unitId')::uuid;
    if not exists (select 1 from public.units where id=v_unit and is_active) or jsonb_typeof(p_input->'capabilities') is distinct from 'array' then
      raise exception 'invalid unit or capabilities' using errcode='22023';
    end if;
    select coalesce(array_agg(distinct item), '{}') into v_caps from jsonb_array_elements_text(p_input->'capabilities') as item;
    if exists(select 1 from unnest(v_caps) c where c not in ('BOAT','EMS','FIRE_SUPPRESSION','EXTRICATION','WATER_RESCUE','ANIMAL_CAPTURE','EVACUATION')) then
      raise exception 'invalid capability' using errcode='22023';
    end if;
    delete from public.unit_capabilities where unit_id=v_unit;
    insert into public.unit_capabilities(unit_id,capability) select v_unit, unnest(v_caps);
    insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
      values(v_actor,'UNIT_CAPABILITIES_CHANGED','unit',v_unit,jsonb_build_object('capabilities',v_caps));
    return jsonb_build_object('unitId',v_unit,'capabilities',v_caps);
  elsif p_action = 'incident_type' then
    v_code := p_input->>'code';
    if jsonb_typeof(p_input->'enabled') is distinct from 'boolean' then raise exception 'invalid enabled flag' using errcode='22023'; end if;
    v_enabled := (p_input->>'enabled')::boolean;
    update public.incident_types set is_enabled=v_enabled where code=v_code;
    if not found then raise exception 'invalid incident type' using errcode='22023'; end if;
    insert into public.audit_logs(actor_user_id,action,target_type,metadata)
      values(v_actor,'INCIDENT_TYPE_CHANGED','incident_type',jsonb_build_object('code',v_code,'enabled',v_enabled));
    return jsonb_build_object('code',v_code,'enabled',v_enabled);
  end if;
  raise exception 'invalid action' using errcode='22023';
end;
$$;
revoke all on function public.admin_manage(text,jsonb) from public, anon;
grant execute on function public.admin_manage(text,jsonb) to authenticated;
