-- TF-78: unit leads may update only their own currently approved, active unit.
create function public.set_own_unit_location(p_unit_id uuid,p_lat double precision,p_lng double precision)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid := rls.current_user_id();
begin
  if actor is null or not (rls.is_admin() or (exists(select 1 from public.users where id=actor and role='UNIT_LEAD') and p_unit_id in (select rls.my_unit_ids(true)))) then
    raise exception 'forbidden' using errcode='42501';
  end if;
  if not exists(select 1 from public.units where id=p_unit_id and is_active)
     or (p_lat is null) <> (p_lng is null)
     or (p_lat is not null and (p_lat not between 5 and 21 or p_lng not between 97 and 106)) then
    raise exception 'invalid unit location' using errcode='22023';
  end if;
  update public.units set location=case when p_lat is null then null else
    extensions.st_setsrid(extensions.st_makepoint(p_lng,p_lat),4326)::extensions.geography end
    where id=p_unit_id;
  insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
    values(actor,'UNIT_LOCATION_CHANGED','unit',p_unit_id,jsonb_build_object('lat',p_lat,'lng',p_lng));
end $$;
revoke all on function public.set_own_unit_location(uuid,double precision,double precision) from public,anon;
grant execute on function public.set_own_unit_location(uuid,double precision,double precision) to authenticated;
