-- Admin can inspect every contact moved into the primary case; each disclosure is audited.
create function public.admin_reveal_case_contacts(p_case_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := rls.current_user_id(); result jsonb;
begin
  if actor is null or not coalesce(rls.is_admin(), false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.cases where id = p_case_id) then
    raise exception 'case not found' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('name',c.name,'phone',c.phone,'lineId',c.line_id,
    'address',c.detailed_address) order by c.is_primary desc,c.created_at,c.id), '[]'::jsonb)
  into result from public.case_contacts c where c.case_id = p_case_id and c.redacted_at is null;
  insert into public.audit_logs(actor_user_id,action,target_type,target_id,case_id,metadata)
    values(actor,'CASE_CONTACT_REVEALED','case',p_case_id,p_case_id,jsonb_build_object('count',jsonb_array_length(result)));
  return result;
end $$;
revoke all on function public.admin_reveal_case_contacts(uuid) from public, anon;
grant execute on function public.admin_reveal_case_contacts(uuid) to authenticated;
