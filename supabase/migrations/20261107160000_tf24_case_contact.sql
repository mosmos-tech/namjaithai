-- TF-24: permission checks and audit are performed in the same transaction as disclosure.
-- Reporters can still read their own contacts. Rescuers/admins must use the audited RPC.
drop policy "read contacts of own or accepted cases" on public.case_contacts;
create policy "reporter reads own contact" on public.case_contacts
for select to authenticated using (
  is_primary and exists (select 1 from public.cases c where c.id = case_contacts.case_id
          and c.reporter_user_id = rls.current_user_id())
);

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

-- Keep the SOS result and request fingerprint atomically, including duplicate-case updates.
-- This permits retrying failed photo uploads without creating or updating a case twice.
create table public.sos_photo_request_replays (
  idempotency_key text primary key,
  case_id uuid not null references public.cases(id) on delete cascade,
  request_hash text not null,
  response jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.sos_photo_request_replays enable row level security;
revoke all on public.sos_photo_request_replays from public, anon, authenticated;

create function public.create_sos_case_with_photos(
  p_idempotency_key text, p_payload jsonb, p_priority_score integer,
  p_client_ip text, p_reporter_user_id uuid, p_photo_fingerprint text
) returns table (
  case_id uuid, case_code text, tracking_token text, status public.case_status,
  created_at timestamptz, replayed boolean, updated_existing boolean,
  is_potential_duplicate boolean, duplicate_of_case_id uuid,
  duplicate_of_case_code text, duplicate_distance_m double precision
) language plpgsql security definer set search_path = '' as $$
declare
  v_hash text := encode(extensions.digest(convert_to(p_payload::text || p_photo_fingerprint, 'UTF8'), 'sha256'), 'hex');
  v_saved public.sos_photo_request_replays%rowtype;
  v_response jsonb;
  v_token text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));
  select * into v_saved from public.sos_photo_request_replays r where r.idempotency_key = p_idempotency_key;
  if found then
    if v_saved.request_hash <> v_hash then raise exception 'idempotency key reused with different content' using errcode = 'SOS25'; end if;
    select c.tracking_token into v_token from public.cases c where c.id = v_saved.case_id;
    v_response := jsonb_set(jsonb_set(v_saved.response, '{replayed}', 'true'::jsonb), '{tracking_token}', to_jsonb(v_token));
  else
    select to_jsonb(r) into v_response from public.create_sos_case(
      p_idempotency_key, p_payload, p_priority_score, p_client_ip, p_reporter_user_id
    ) r;
    -- Existing legacy requests were not fingerprinted; bind replay to the original phone.
    if (v_response->>'replayed')::boolean and not exists (
      select 1 from public.case_contacts cc where cc.case_id = (v_response->>'case_id')::uuid
        and cc.phone = regexp_replace(coalesce(p_payload->>'phone', ''), '[^0-9]', '', 'g')
    ) then raise exception 'idempotency key does not match case' using errcode = '42501'; end if;
    insert into public.sos_photo_request_replays(idempotency_key,case_id,request_hash,response)
    values (p_idempotency_key,(v_response->>'case_id')::uuid,v_hash,v_response - 'tracking_token');
  end if;
  return query select
    (v_response->>'case_id')::uuid, v_response->>'case_code', v_response->>'tracking_token',
    (v_response->>'status')::public.case_status, (v_response->>'created_at')::timestamptz,
    (v_response->>'replayed')::boolean, (v_response->>'updated_existing')::boolean,
    (v_response->>'is_potential_duplicate')::boolean, (v_response->>'duplicate_of_case_id')::uuid,
    v_response->>'duplicate_of_case_code', (v_response->>'duplicate_distance_m')::double precision;
end $$;

-- Serialize reservations so concurrent submissions cannot exceed three images per case.
create function public.reserve_case_photo(p_case_id uuid, p_path text, p_size integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_size < 1 or p_size > 512000 or p_path !~ ('^' || p_case_id::text || '/[a-f0-9]{64}[.]jpg$') then
    raise exception 'invalid photo' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_case_id::text, 24));
  if exists (select 1 from public.case_media where case_id=p_case_id and storage_path=p_path) then return; end if;
  if (select count(*) from public.case_media where case_id=p_case_id) >= 3 then
    raise exception 'case photo limit reached' using errcode = 'SOS24';
  end if;
  insert into public.case_media(case_id,storage_path,mime_type,file_size_bytes)
    values (p_case_id,p_path,'image/jpeg',p_size);
end $$;
revoke all on function public.create_sos_case_with_photos(text,jsonb,integer,text,uuid,text) from public, anon, authenticated;
revoke all on function public.reserve_case_photo(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.create_sos_case_with_photos(text,jsonb,integer,text,uuid,text) to service_role;
grant execute on function public.reserve_case_photo(uuid,text,integer) to service_role;
