-- TF-44: ปิดบังข้อมูลติดต่อและลบข้อมูลสุขภาพเมื่อปิดเคสเกิน 90 วัน
-- เก็บแถวเคสและตัวเลขที่ใช้ทำสถิติไว้ และบันทึกเฉพาะจำนวนลง audit

alter table public.case_contacts alter column phone_last4 drop not null;
alter table public.cases alter column lat drop not null, alter column lng drop not null,
  alter column location drop not null, add column pii_redacted_at timestamptz;

-- คิวส่วนตัวเก็บ path จน Storage API ยืนยันว่าลบไฟล์แล้ว ห้ามเปิดให้ผู้ใช้ทั่วไปอ่าน
create table rls.case_media_deletion_queue (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  case_id uuid not null references public.cases(id),
  storage_path text not null unique,
  attempts integer not null default 0,
  locked_until timestamptz,
  lease_id uuid,
  failed_at timestamptz,
  created_at timestamptz not null default pg_catalog.now()
);
alter table rls.case_media_deletion_queue enable row level security;
revoke all on rls.case_media_deletion_queue from public, anon, authenticated, service_role;

-- อนุญาตการปกปิดประวัติได้เฉพาะเคสและ transaction ที่ฟังก์ชัน retention กำลังประมวลผล
create table rls.case_pii_redaction_scope (
  backend_pid integer not null,
  transaction_id bigint not null,
  case_id uuid not null,
  primary key (backend_pid, transaction_id, case_id)
);
revoke all on rls.case_pii_redaction_scope from public, anon, authenticated, service_role;

create or replace function public.prevent_append_only_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_allowed boolean := false;
begin
  if tg_op = 'UPDATE' then
    select exists (select 1 from rls.case_pii_redaction_scope s
      where s.backend_pid = pg_catalog.pg_backend_pid()
        and s.transaction_id = pg_catalog.txid_current()
        and s.case_id::text = coalesce(pg_catalog.to_jsonb(old) ->> 'case_id',
          case when pg_catalog.to_jsonb(old) ->> 'target_type' = 'case'
            then pg_catalog.to_jsonb(old) ->> 'target_id' end))
    into v_allowed;
    if v_allowed and tg_table_name = 'case_events' then
      if (pg_catalog.to_jsonb(new) - array['note','metadata','actor_user_id']) =
          (pg_catalog.to_jsonb(old) - array['note','metadata','actor_user_id'])
      and new.note is null and new.actor_user_id is null
      and new.metadata = (case when pg_catalog.jsonb_typeof(old.metadata -> 'peopleHelped') = 'number'
        and old.metadata ->> 'peopleHelped' ~ '^[0-9]{1,3}$'
        then pg_catalog.jsonb_build_object('peopleHelped', old.metadata -> 'peopleHelped') else '{}'::jsonb end)
      then return new; end if;
    end if;
    if v_allowed and tg_table_name = 'audit_logs' then
      if (pg_catalog.to_jsonb(new) - array['metadata','actor_user_id','target_user_id','ip_address','user_agent']) =
          (pg_catalog.to_jsonb(old) - array['metadata','actor_user_id','target_user_id','ip_address','user_agent'])
      and new.metadata = '{}'::jsonb and new.actor_user_id is null and new.target_user_id is null
      and new.ip_address is null and new.user_agent is null
      then return new; end if;
    end if;
  end if;
  raise exception 'Table %.% is append-only: % operation is not allowed', tg_table_schema, tg_table_name, tg_op
    using errcode = '42501';
end;
$$;

create function public.purge_closed_case_pii()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case_ids uuid[];
  v_contacts integer;
  v_health integer;
begin
  -- ป้องกันงานที่รันพร้อมกันสร้าง audit ซ้ำ และล็อกเคสระหว่างตรวจสถานะกับล้างข้อมูล
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('tf44-case-pii-retention'));

  select coalesce(pg_catalog.array_agg(eligible.id), array[]::uuid[])
  into v_case_ids
  from (
    select c.id
    from public.cases c
    where not c.is_demo -- ข้อมูลจำลองจาก seed ไม่มีผู้ประสบภัยจริงและใช้แสดงสถิติทดลอง
      and c.status in ('RESOLVED', 'CANCELLED', 'DUPLICATE', 'UNREACHABLE')
      and c.closed_at < pg_catalog.now() - interval '90 days'
      and (c.pii_redacted_at is null or
        exists (
          select 1 from public.case_contacts cc
          where (cc.case_id = c.id or exists (
            select 1 from rls.case_merged_contacts mc
            where mc.original_case_id = c.id and mc.contact_id = cc.id
          ))
            and (cc.redacted_at is null or cc.name is not null or cc.phone is not null
              or cc.phone_last4 is not null or cc.line_id is not null or cc.detailed_address is not null)
        )
        or exists (select 1 from public.case_sensitive_details sd where sd.case_id = c.id)
        or exists (select 1 from public.case_media m where m.case_id = c.id)
      )
    order by c.closed_at, c.id limit 100 for update of c skip locked
  ) eligible;

  insert into rls.case_pii_redaction_scope(backend_pid, transaction_id, case_id)
  select pg_catalog.pg_backend_pid(), pg_catalog.txid_current(), id from pg_catalog.unnest(v_case_ids) id;

  -- คงจังหวัด ประเภท เหตุ เวลา และตัวเลขที่ใช้ทำสถิติ แต่ล้างพิกัดและข้อความอิสระ
  update public.cases c set
    lat = null, lng = null, location = null, accuracy_m = null, subdistrict = null,
    landmark = '[ลบข้อมูลส่วนบุคคลแล้ว]', notes = null, resolution_note = null,
    urgency_override_reason = null, urgency_overridden_by = null, reporter_user_id = null,
    assigned_rescuer_id = null, idempotency_key = null, details = '{}'::jsonb,
    triage_reasons = array[]::text[], location_source = null,
    case_code = 'ANON-' || pg_catalog.encode(extensions.gen_random_bytes(16), 'hex'),
    tracking_token = pg_catalog.encode(extensions.gen_random_bytes(16), 'hex'),
    pii_redacted_at = pg_catalog.now()
  where c.id = any(v_case_ids) and c.pii_redacted_at is null;

  update public.case_contacts cc
  set name = null, phone = null, phone_last4 = null, line_id = null,
      detailed_address = null, redacted_at = coalesce(cc.redacted_at, pg_catalog.now())
  where (
      cc.case_id = any(v_case_ids)
      or exists (
        select 1 from rls.case_merged_contacts mc
        where mc.original_case_id = any(v_case_ids) and mc.contact_id = cc.id
      )
    )
    and (cc.redacted_at is null or cc.name is not null or cc.phone is not null
      or cc.phone_last4 is not null or cc.line_id is not null or cc.detailed_address is not null);
  get diagnostics v_contacts = row_count;

  delete from public.case_sensitive_details sd where sd.case_id = any(v_case_ids);
  get diagnostics v_health = row_count;

  update public.case_needs n set other_detail = case when n.need = 'OTHER'
    then '[ลบข้อมูลส่วนบุคคลแล้ว]' else null end
  where n.case_id = any(v_case_ids) and n.other_detail is not null;
  update public.case_performance_reviews set note = null, reviewed_by = null
  where case_id = any(v_case_ids) and (note is not null or reviewed_by is not null);
  update public.case_events e set note = null, actor_user_id = null,
    metadata = case when pg_catalog.jsonb_typeof(e.metadata -> 'peopleHelped') = 'number'
      and e.metadata ->> 'peopleHelped' ~ '^[0-9]{1,3}$'
      then pg_catalog.jsonb_build_object('peopleHelped', e.metadata -> 'peopleHelped') else '{}'::jsonb end
  where e.case_id = any(v_case_ids);
  update public.audit_logs a set metadata = '{}'::jsonb, actor_user_id = null, target_user_id = null,
    ip_address = null, user_agent = null
  where a.case_id = any(v_case_ids) or (a.target_type = 'case' and a.target_id = any(v_case_ids));

  update public.sms_inbound_messages set phone = null, lat = null, lng = null, parse_error = null,
    provider_message_id = 'redacted-' || id::text,
    pii_purged_at = coalesce(pii_purged_at, pg_catalog.now()) where case_id = any(v_case_ids);
  delete from public.sos_photo_request_replays where case_id = any(v_case_ids);
  delete from public.case_line_notifications where case_id = any(v_case_ids);
  delete from public.case_lead_alerts where case_id = any(v_case_ids);
  delete from public.line_red_case_queue where case_id = any(v_case_ids);
  update public.rescuer_locations set active_case_id = null where active_case_id = any(v_case_ids);
  delete from rls.case_confirmation_secrets where case_id = any(v_case_ids);

  -- รูปของเคสซ้ำอาจถูกย้ายไปเคสหลัก แต่ prefix ของ path ยังคงเป็น id เคสเดิม
  with detached as (
    delete from public.case_media m
    where m.case_id = any(v_case_ids)
       or pg_catalog.split_part(m.storage_path, '/', 1) = any(
         array(select id::text from pg_catalog.unnest(v_case_ids) id))
    returning m.id, m.case_id, m.storage_path
  )
  insert into rls.case_media_deletion_queue(id, case_id, storage_path)
  select d.id, coalesce((select id from pg_catalog.unnest(v_case_ids) id
    where id::text = pg_catalog.split_part(d.storage_path, '/', 1) limit 1), d.case_id), d.storage_path
  from detached d on conflict (storage_path) do nothing;

  delete from rls.case_pii_redaction_scope
  where backend_pid = pg_catalog.pg_backend_pid() and transaction_id = pg_catalog.txid_current();

  if pg_catalog.cardinality(v_case_ids) > 0 then
    insert into public.audit_logs (action, target_type, metadata)
    values ('CASE_PII_PURGED', 'cases', pg_catalog.jsonb_build_object(
      'cases', pg_catalog.cardinality(v_case_ids), 'contacts', v_contacts, 'health_records', v_health
    ));
  end if;
  return pg_catalog.cardinality(v_case_ids);
end;
$$;

revoke all on function public.purge_closed_case_pii() from public, anon, authenticated;
grant execute on function public.purge_closed_case_pii() to service_role;

-- worker รับคิวแบบมี lease เพื่อให้ลองใหม่ได้หลังหมดเวลา และไม่ลบคิวก่อน Storage ยืนยัน
-- จำกัดจำนวนครั้งลองใหม่ (10 ครั้ง) เพื่อไม่ให้ไฟล์ที่มีปัญหาถาวรวนลองซ้ำไม่รู้จบ
create function public.claim_case_media_deletions(p_limit integer default 25)
returns table(id uuid, storage_path text, lease_id uuid)
language plpgsql security definer set search_path = '' as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'invalid limit' using errcode = '22023';
  end if;
  with exhausted as (
    update rls.case_media_deletion_queue q
    set failed_at = pg_catalog.now(), lease_id = null, locked_until = null
    where q.failed_at is null
      and q.attempts >= 10
      and (q.locked_until is null or q.locked_until < pg_catalog.now())
    returning q.case_id
  )
  insert into public.audit_logs(action, target_type, case_id, metadata)
  select 'CASE_MEDIA_PURGE_FAILED', 'case', e.case_id, '{"reason":"retry_limit"}'::jsonb
  from exhausted e;

  return query
  with selected as (
    select q.id from rls.case_media_deletion_queue q
    where q.failed_at is null
      and q.attempts < 10
      and (q.locked_until is null or q.locked_until < pg_catalog.now())
    order by q.attempts, q.created_at, q.id for update skip locked limit p_limit
  )
  update rls.case_media_deletion_queue q
  set lease_id = pg_catalog.gen_random_uuid(), locked_until = pg_catalog.now() + interval '2 minutes',
      attempts = q.attempts + 1
  from selected s where q.id = s.id returning q.id, q.storage_path, q.lease_id;
end;
$$;

create function public.finish_case_media_deletion(p_id uuid, p_lease_id uuid, p_success boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_case_id uuid;
  v_attempts integer;
begin
  if p_success is null then raise exception 'invalid result' using errcode = '22023'; end if;
  if p_success then
    delete from rls.case_media_deletion_queue q
    where q.id = p_id and q.lease_id = p_lease_id and q.failed_at is null
    returning q.case_id into v_case_id;
    if not found then return false; end if;
    insert into public.audit_logs(action, target_type, case_id, metadata)
    values ('CASE_MEDIA_PURGED', 'case', v_case_id, '{}'::jsonb);
    return true;
  end if;
  update rls.case_media_deletion_queue q
  set lease_id = null,
      locked_until = null,
      failed_at = case when q.attempts >= 10 then pg_catalog.now() else null end
  where q.id = p_id and q.lease_id = p_lease_id and q.failed_at is null
  returning q.case_id, q.attempts into v_case_id, v_attempts;
  if not found then return false; end if;
  if v_attempts >= 10 then
    insert into public.audit_logs(action, target_type, case_id, metadata)
    values ('CASE_MEDIA_PURGE_FAILED', 'case', v_case_id, '{"reason":"retry_limit"}'::jsonb);
  end if;
  return true;
end;
$$;
revoke all on function public.claim_case_media_deletions(integer) from public, anon, authenticated;
revoke all on function public.finish_case_media_deletion(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.claim_case_media_deletions(integer) to service_role;
grant execute on function public.finish_case_media_deletion(uuid, uuid, boolean) to service_role;

create function public.run_case_media_retention_worker()
returns void language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text;
begin
  if not exists (select 1 from rls.case_media_deletion_queue where failed_at is null) then
    return;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'retention_worker_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'retention_worker_secret';
  if v_url is null or v_secret is null then
    raise exception 'retention media worker is not configured';
  end if;
  perform net.http_post(url := v_url, body := '{}'::jsonb,
    headers := pg_catalog.jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    timeout_milliseconds := 30000);
end;
$$;
revoke all on function public.run_case_media_retention_worker() from public, anon, authenticated;

-- การล้างอัตโนมัติไม่เริ่มจนกว่าจะตั้งค่า worker ลบไฟล์ใน Vault
create function public.run_case_retention_scheduled()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'retention_worker_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'retention_worker_secret';
  if v_url is null or pg_catalog.btrim(v_url) = '' or v_secret is null or pg_catalog.length(v_secret) < 16 then
    raise exception 'retention media worker is not configured';
  end if;
  return public.purge_closed_case_pii();
end;
$$;
revoke all on function public.run_case_retention_scheduled() from public, anon, authenticated, service_role;

-- pg_cron ใช้ UTC: 19:10 UTC ตรงกับ 02:10 น. ของวันถัดไปในประเทศไทย
select cron.schedule('tf44-case-pii-retention', '10 19 * * *', 'select public.run_case_retention_scheduled()');
-- เก็บงานที่เกิน 100 เคสหรือถูกล็อกไว้ต่อทุก 5 นาทีช่วง 02:00–05:55 เวลาไทย
select cron.schedule('tf44-case-pii-retention-backlog', '*/5 19-22 * * *', 'select public.run_case_retention_scheduled()');
select cron.schedule('tf44-media-retention-worker', '*/5 * * * *', 'select public.run_case_media_retention_worker()');
