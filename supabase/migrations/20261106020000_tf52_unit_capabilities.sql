-- Capabilities are a user preference, never a restriction on case visibility.
-- TF-30 also introduces this table; it may be merged before this migration.
create table if not exists public.unit_capabilities (
  unit_id uuid not null references public.units(id) on delete cascade,
  capability text not null check (capability in ('BOAT','EMS','FIRE_SUPPRESSION','EXTRICATION','WATER_RESCUE','ANIMAL_CAPTURE','EVACUATION')),
  primary key (unit_id, capability)
);
alter table public.unit_capabilities enable row level security;
grant select on public.unit_capabilities to authenticated;
drop policy if exists "members and admins read unit capabilities" on public.unit_capabilities;
create policy "members and admins read unit capabilities" on public.unit_capabilities for select to authenticated
  using (rls.is_admin() or unit_id in (select rls.my_unit_ids()));

create function public.set_unit_capabilities(p_unit_id uuid, p_capabilities text[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_caps text[];
begin
  if not (rls.is_admin() or p_unit_id in (select rls.my_unit_ids(true))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.units where id = p_unit_id and is_active)
    or p_capabilities is null
    or exists (select 1 from unnest(p_capabilities) c where c is null or c not in
      ('BOAT','EMS','FIRE_SUPPRESSION','EXTRICATION','WATER_RESCUE','ANIMAL_CAPTURE','EVACUATION')) then
    raise exception 'invalid capabilities' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct c order by c), '{}') into v_caps from unnest(p_capabilities) c;
  delete from public.unit_capabilities where unit_id = p_unit_id;
  insert into public.unit_capabilities(unit_id, capability) select p_unit_id, unnest(v_caps);
  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
    values (rls.current_user_id(), 'UNIT_CAPABILITIES_CHANGED', 'unit', p_unit_id,
      jsonb_build_object('capabilities', v_caps));
end;
$$;
revoke all on function public.set_unit_capabilities(uuid,text[]) from public, anon;
grant execute on function public.set_unit_capabilities(uuid,text[]) to authenticated;
