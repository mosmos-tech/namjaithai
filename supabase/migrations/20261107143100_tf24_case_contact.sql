-- TF-24: permission checks and audit are performed in the same transaction as disclosure.
create function public.case_detail_permissions(p_case_id uuid)
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
      and item.status in ('NEW', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE')
  );
end $$;

create function public.reveal_case_contact(p_case_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := rls.current_user_id();
  contact public.case_contacts%rowtype;
begin
  if not coalesce((public.case_detail_permissions(p_case_id)->>'contact')::boolean, false) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into contact from public.case_contacts
  where case_id = p_case_id and redacted_at is null
  order by is_primary desc, created_at asc, id asc limit 1;
  if not found then return null; end if;
  insert into public.audit_logs(actor_user_id, action, target_type, target_id, case_id, metadata)
  values (actor, 'CASE_CONTACT_REVEALED', 'case', p_case_id, p_case_id, '{}'::jsonb);
  return jsonb_build_object('name', contact.name, 'phone', contact.phone, 'lineId', contact.line_id,
                            'address', contact.detailed_address);
end $$;

revoke all on function public.case_detail_permissions(uuid) from public, anon;
revoke all on function public.reveal_case_contact(uuid) from public, anon;
grant execute on function public.case_detail_permissions(uuid) to authenticated;
grant execute on function public.reveal_case_contact(uuid) to authenticated;

-- Images are private and can only be signed for a person allowed to see that case's media.
insert into storage.buckets(id, name, public) values ('case-media', 'case-media', false)
on conflict (id) do nothing;
do $$
begin
  if exists (select 1 from storage.buckets where id = 'case-media' and public) then
    raise exception 'case-media bucket must be private';
  end if;
end $$;
create policy "case media read for authorized viewer" on storage.objects
for select to authenticated using (
  bucket_id = 'case-media' and exists (
    select 1 from public.case_media m where m.storage_path = storage.objects.name and rls.can_see_case_private(m.case_id)
  )
);
