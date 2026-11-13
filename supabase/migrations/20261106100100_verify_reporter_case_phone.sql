-- Tracking links are shareable: require the original full phone before reading/editing
-- reporter details. Keep phone out of URLs and audit metadata. All RPCs are service-only.
create or replace function public.reporter_case_verified(
  p_case_code text, p_token text, p_phone text,
  p_action text default 'read', p_payload jsonb default '{}', p_client_ip text default null
) returns jsonb language plpgsql set search_path = public, extensions as $$
declare
  v_bucket text;
  v_count integer;
  v_oldest timestamptz;
begin
  if nullif(btrim(p_client_ip), '') is not null then
    v_bucket := 'reporter:' || encode(digest(btrim(p_client_ip), 'sha256'), 'hex');
    -- Serialize this bucket so concurrent guesses cannot bypass the limit.
    perform pg_advisory_xact_lock(hashtextextended(v_bucket, 0));
    delete from public.sos_rate_limit_hits where bucket = v_bucket and created_at < now() - interval '15 minutes';
    select count(*), min(created_at) into v_count, v_oldest
      from public.sos_rate_limit_hits where bucket = v_bucket;
    if v_count >= 10 then
      raise exception 'too many failed reporter verifications' using errcode = 'SOS29',
        hint = greatest(1, ceil(extract(epoch from (v_oldest + interval '15 minutes' - now()))))::text;
    end if;
  end if;
  if not exists (
    select 1 from public.cases c join public.case_contacts cc on cc.case_id = c.id
    where c.case_code = upper(btrim(p_case_code)) and c.tracking_token = p_token
      and cc.phone = p_phone and cc.redacted_at is null
  ) then
    if v_bucket is not null then
      insert into public.sos_rate_limit_hits(bucket) values(v_bucket);
    end if;
    return null;
  end if;
  return public.reporter_case(p_case_code, p_token, p_action, p_payload);
end;
$$;
revoke all on function public.reporter_case_verified(text, text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.reporter_case_verified(text, text, text, text, jsonb, text) to service_role;
