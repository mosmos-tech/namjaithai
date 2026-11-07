-- ============================================================================
-- TF-34: แจ้งเตือนผ่าน LINE — ต่อยอดคิวเดิมของ TF-43 (case_line_notifications) และ TF-20
-- (member_line_notifications) ไม่สร้างระบบใหม่ซ้ำ
--
--   1. คิวเคสรองรับหลายเหตุการณ์: CASE_STATUS (ของเดิม) / RED_ALERT / CLOSE_CONFIRM (จุดเชื่อมให้ TF-58)
--   2. กันส่งเรื่องเดิมถึงคนเดิมซ้ำภายใน 10 นาที (trigger BEFORE INSERT ทั้ง 2 คิว)
--   3. เคสแดงใหม่: trigger เขียนแค่ 1 แถวลง line_red_case_queue — worker (TypeScript) หาผู้รับ
--      ด้วย canUnitHandle() ไม่เกินหน่วยละ 2 คน รวมไม่เกิน 10 คน แล้วรวมเป็นข้อความเดียวต่อคน
--      ไม่เกิน 1 ข้อความต่อ 5 นาที
--   4. เปิด trigger สถานะเคสที่ TF-43 พักไว้ — การส่งจริงถูกคุมด้วยด่าน dev/uat ใน worker
--   5. โควตา LINE รายเดือนหมด: หยุดส่งทั้งระบบถึงต้นเดือนหน้า + audit_logs ให้แอดมินเห็น
--   6. pg_cron เรียก worker ทุกนาทีผ่าน pg_net ด้วย URL/secret ใน Supabase Vault (ไม่มีค่าลับในไฟล์)
--      และล้างคิวเก่ากว่า 30 วันทุกวัน
-- การเขียนคิวทุกจุดครอบ exception: คิวพลาดแล้วการส่ง SOS / เปลี่ยนสถานะยังสำเร็จ
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. คิวเคส: ชนิดเหตุการณ์, สถานะ SKIPPED (dev/uat ไม่ส่งจริง), digest ของเคสแดง
-- ----------------------------------------------------------------------------
alter table public.case_line_notifications
  add column kind text not null default 'CASE_STATUS'
    check (kind in ('CASE_STATUS', 'RED_ALERT', 'CLOSE_CONFIRM')),
  -- เคสแดงหลายเคสของคนเดียวกันรวมเป็นข้อความเดียว ใช้เป็น X-Line-Retry-Key ของข้อความนั้น
  add column digest_id uuid,
  alter column to_status drop not null,
  add constraint case_line_notifications_status_required
    check (kind <> 'CASE_STATUS' or to_status is not null);

alter table public.case_line_notifications drop constraint case_line_notifications_state_check;
alter table public.case_line_notifications add constraint case_line_notifications_state_check
  check (state in ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED'));
alter table public.member_line_notifications drop constraint member_line_notifications_state_check;
alter table public.member_line_notifications add constraint member_line_notifications_state_check
  check (state in ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED'));

create index idx_case_line_notification_dedupe
  on public.case_line_notifications (case_id, user_id, kind, created_at desc);
create index idx_case_line_notification_red_user
  on public.case_line_notifications (user_id, kind, state);

-- ----------------------------------------------------------------------------
-- 2. กันส่งซ้ำ 10 นาที: เรื่องเดียวกัน (ชนิด + เคส + ผู้รับ + สถานะ) ไม่เพิ่มแถวใหม่
-- ----------------------------------------------------------------------------
create function public.skip_duplicate_case_line_notification() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (
    select 1 from public.case_line_notifications n
    where n.kind = new.kind and n.case_id = new.case_id and n.user_id = new.user_id
      and n.to_status is not distinct from new.to_status
      and n.created_at > now() - interval '10 minutes'
  ) then
    return null;
  end if;
  return new;
end;
$$;
create trigger trg_case_line_notification_dedupe before insert on public.case_line_notifications
  for each row execute function public.skip_duplicate_case_line_notification();

create function public.skip_duplicate_member_line_notification() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (
    select 1 from public.member_line_notifications n
    where n.unit_member_id = new.unit_member_id and n.to_status = new.to_status
      and n.created_at > now() - interval '10 minutes'
  ) then
    return null;
  end if;
  return new;
end;
$$;
create trigger trg_member_line_notification_dedupe before insert on public.member_line_notifications
  for each row execute function public.skip_duplicate_member_line_notification();

-- ----------------------------------------------------------------------------
-- 3. คิวสถานะเคส (TF-43): ครอบ exception แล้วเปิดใช้
-- ----------------------------------------------------------------------------
create or replace function public.enqueue_case_line_notification() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status is distinct from new.status and new.reporter_user_id is not null then
    begin
      insert into public.case_line_notifications(case_id, user_id, to_status)
        select new.id, u.id, new.status from public.users u
        where u.id = new.reporter_user_id and u.status = 'ACTIVE' and u.line_user_id ~ '^U[0-9a-fA-F]{32}$';
    exception when others then
      raise warning 'line notification enqueue failed: %', sqlerrm;
    end;
  end if;
  return new;
end;
$$;
alter table public.cases enable trigger trg_case_line_notification;

-- ----------------------------------------------------------------------------
-- 4. เคสแดงใหม่: เขียนแค่ 1 แถว ให้ worker กระจายต่อ
-- ----------------------------------------------------------------------------
create table public.line_red_case_queue (
  case_id uuid primary key references public.cases(id) on delete cascade,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
alter table public.line_red_case_queue enable row level security;
revoke all on public.line_red_case_queue from public, anon, authenticated;
grant all on public.line_red_case_queue to service_role;

create function public.enqueue_red_case_alert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.urgency = 'RED' and new.status = 'NEW'
     and (tg_op = 'INSERT' or old.urgency is distinct from 'RED') then
    begin
      insert into public.line_red_case_queue(case_id) values (new.id) on conflict (case_id) do nothing;
    exception when others then
      raise warning 'red case alert enqueue failed: %', sqlerrm;
    end;
  end if;
  return new;
end;
$$;
revoke all on function public.enqueue_red_case_alert() from public, anon, authenticated;
create trigger trg_line_red_case_alert after insert or update of urgency on public.cases
  for each row execute function public.enqueue_red_case_alert();

-- เคสแดงที่รอกระจาย (เคสที่ไม่ใช่ NEW แล้วถือว่าจบ ไม่ต้องแจ้ง)
create function public.claim_red_case_fanouts()
returns table(case_id uuid, incident_type text)
language plpgsql set search_path = '' as $$
begin
  update public.line_red_case_queue q set processed_at = now()
    from public.cases c
    where c.id = q.case_id and q.processed_at is null and c.status <> 'NEW';
  return query
    select q.case_id, c.incident_type
    from public.line_red_case_queue q join public.cases c on c.id = q.case_id
    where q.processed_at is null
    order by q.created_at
    limit 10
    for update of q skip locked;
end;
$$;

-- ผู้รับที่เป็นไปได้: กู้ภัยออนไลน์ในหน่วยที่ยังใช้งาน จังหวัดเดียวกับเคส (หน่วยระบุอำเภอ → อำเภอต้องตรง)
-- TODO(TF-28): เปลี่ยนเป็นกู้ภัยที่อยู่ในรัศมี 5 กม. จากตำแหน่งสดใน rescuer_locations
-- คืนความสามารถของหน่วยด้วย ให้ worker คัดด้วย canUnitHandle() ฝั่ง TypeScript (กติกาอยู่ที่เดียว)
create function public.list_red_alert_candidates(p_case_id uuid)
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
  where c.id = p_case_id and u.id is distinct from c.reporter_user_id
  order by un.created_at, un.id, m.approved_at nulls last, u.id
$$;

-- เพิ่มงานแจ้งเคสแดงรายคน (ไม่เกิน 10 คนต่อเคส) แล้วปิดแถวกระจาย
create function public.enqueue_red_alerts(p_case_id uuid, p_user_ids uuid[])
returns integer
language plpgsql set search_path = '' as $$
declare v_count integer;
begin
  insert into public.case_line_notifications(kind, case_id, user_id)
    select 'RED_ALERT', p_case_id, x
    from unnest((coalesce(p_user_ids, '{}'))[1:10]) as x;
  get diagnostics v_count = row_count;
  update public.line_red_case_queue set processed_at = now() where case_id = p_case_id;
  return v_count;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. ผู้ส่ง: claim/finish ของคิวเคส (แยกงานเคสแดงไปรวมเป็น digest)
-- ----------------------------------------------------------------------------
drop function public.claim_case_line_notifications();
create function public.claim_case_line_notifications()
returns table(id uuid, lease_id uuid, line_user_id text, case_code text, tracking_token text,
  kind text, to_status public.case_status, incident_type text, district text, province text,
  created_at timestamptz)
language plpgsql set search_path = '' as $$
#variable_conflict use_column
begin
  -- Expired attempts cannot retry beyond the LINE retry-key lifetime (24h).
  update public.case_line_notifications n set state = 'FAILED', last_error = 'retry_limit'
    where n.state in ('PENDING', 'SENDING')
      and (n.attempts >= 5 or n.created_at < now() - interval '23 hours')
      and (n.locked_until is null or n.locked_until < now());
  update public.case_line_notifications n set state = 'FAILED', last_error = 'recipient_unavailable'
    where n.state in ('PENDING', 'SENDING') and not exists (
      select 1 from public.users u where u.id = n.user_id and u.status = 'ACTIVE'
        and u.line_user_id ~ '^U[0-9a-fA-F]{32}$'
    );
  return query
  with picked as (
    select n.id from public.case_line_notifications n
    where n.kind <> 'RED_ALERT' and n.state in ('PENDING', 'SENDING') and n.next_attempt_at <= now()
      and (n.locked_until is null or n.locked_until < now())
      -- รักษาลำดับต่อ (เคส, ผู้รับ) — ผู้รับคนละคนของเคสเดียวกันไม่ต้องรอกัน
      and not exists (select 1 from public.case_line_notifications prior
        where prior.case_id = n.case_id and prior.user_id = n.user_id and prior.kind <> 'RED_ALERT'
          and prior.seq < n.seq and prior.state in ('PENDING', 'SENDING'))
    order by n.seq limit 10 for update skip locked
  ), leased as (
    update public.case_line_notifications n set state = 'SENDING', attempts = n.attempts + 1,
      lease_id = gen_random_uuid(), locked_until = now() + interval '2 minutes'
    from picked where n.id = picked.id returning n.*
  ) select n.id, n.lease_id, u.line_user_id, c.case_code, c.tracking_token, n.kind, n.to_status,
      c.incident_type, c.district, c.province, n.created_at
    from leased n join public.users u on u.id = n.user_id join public.cases c on c.id = n.case_id
    order by n.seq;
end;
$$;

-- ผลการส่ง: SENT / RETRY / FAILED / SKIPPED (dev/uat ไม่ส่งจริง) / RELEASE (คืนคิวไม่นับครั้ง เช่น หยุดเพราะโควตาหมด)
create or replace function public.finish_case_line_notification(
  p_id uuid, p_lease_id uuid, p_result text, p_error text default null)
returns void language plpgsql set search_path = '' as $$
begin
  if p_result not in ('SENT', 'RETRY', 'FAILED', 'SKIPPED', 'RELEASE') then
    raise exception 'invalid result';
  end if;
  update public.case_line_notifications set
    state = case p_result
      when 'RETRY' then case when attempts < 5 then 'PENDING' else 'FAILED' end
      when 'RELEASE' then 'PENDING'
      else p_result end,
    attempts = case when p_result = 'RELEASE' then greatest(attempts - 1, 0) else attempts end,
    accepted_at = case when p_result in ('SENT', 'SKIPPED') then now() else null end,
    next_attempt_at = case when p_result = 'RELEASE' then next_attempt_at
      else now() + interval '1 minute' * power(2, least(attempts, 5)) end,
    locked_until = null, lease_id = null, last_error = left(p_error, 80)
    where id = p_id and lease_id = p_lease_id and state = 'SENDING';
end;
$$;

create or replace function public.finish_member_line_notification(
  p_id uuid, p_lease_id uuid, p_result text, p_error text default null)
returns void language plpgsql set search_path = '' as $$
begin
  if p_result not in ('SENT', 'RETRY', 'FAILED', 'SKIPPED', 'RELEASE') then
    raise exception 'invalid result';
  end if;
  update public.member_line_notifications set
    state = case p_result
      when 'RETRY' then case when attempts < 5 then 'PENDING' else 'FAILED' end
      when 'RELEASE' then 'PENDING'
      else p_result end,
    attempts = case when p_result = 'RELEASE' then greatest(attempts - 1, 0) else attempts end,
    accepted_at = case when p_result in ('SENT', 'SKIPPED') then now() else null end,
    next_attempt_at = case when p_result = 'RELEASE' then next_attempt_at
      else now() + interval '1 minute' * power(2, least(attempts, 5)) end,
    locked_until = null, lease_id = null, last_error = left(p_error, 80)
    where id = p_id and lease_id = p_lease_id and state = 'SENDING';
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. digest เคสแดง: รวมทุกเคสที่รอของผู้รับคนเดียวเป็น 1 ข้อความ ไม่เกิน 1 ข้อความต่อ 5 นาที
-- ----------------------------------------------------------------------------
create function public.claim_red_alert_digests()
returns table(digest_id uuid, lease_id uuid, line_user_id text, case_count integer,
  case_code text, incident_type text, urgency public.urgency_level, district text, province text)
language plpgsql set search_path = '' as $$
-- ชื่อผลลัพธ์ (digest_id, lease_id ...) ซ้ำกับคอลัมน์ ให้หมายถึงคอลัมน์ในตาราง
#variable_conflict use_column
declare
  v_user uuid;
  v_digest uuid;
  v_lease uuid;
begin
  update public.case_line_notifications n set state = 'FAILED', last_error = 'retry_limit'
    where n.kind = 'RED_ALERT' and n.state in ('PENDING', 'SENDING')
      and (n.attempts >= 5 or n.created_at < now() - interval '23 hours')
      and (n.locked_until is null or n.locked_until < now());
  -- เคสมีคนรับแล้ว/ปิดแล้วก่อนถึงคิว ไม่ต้องปลุกกู้ภัย
  update public.case_line_notifications n set state = 'FAILED', last_error = 'case_not_open'
    from public.cases c
    where c.id = n.case_id and n.kind = 'RED_ALERT' and n.state = 'PENDING' and c.status <> 'NEW';
  update public.case_line_notifications n set state = 'FAILED', last_error = 'recipient_unavailable'
    where n.kind = 'RED_ALERT' and n.state = 'PENDING' and not exists (
      select 1 from public.users u where u.id = n.user_id and u.status = 'ACTIVE'
        and u.line_user_id ~ '^U[0-9a-fA-F]{32}$'
    );

  for v_user in
    select distinct n.user_id from public.case_line_notifications n
    where n.kind = 'RED_ALERT' and n.state = 'PENDING' and n.next_attempt_at <= now()
      and not exists (select 1 from public.case_line_notifications busy
        where busy.user_id = n.user_id and busy.kind = 'RED_ALERT' and busy.state = 'SENDING'
          and busy.locked_until > now())
      -- ไม่เกิน 1 ข้อความเคสแดงต่อ 5 นาทีต่อคน
      and not exists (select 1 from public.case_line_notifications recent
        where recent.user_id = n.user_id and recent.kind = 'RED_ALERT'
          and recent.state in ('SENT', 'SKIPPED') and recent.accepted_at > now() - interval '5 minutes')
    limit 10
  loop
    continue when not pg_try_advisory_xact_lock(hashtextextended('line-red:' || v_user::text, 0));
    -- ส่งซ้ำ (retry) ต้องใช้ชุดเคสและ retry key เดิม
    select n.digest_id into v_digest from public.case_line_notifications n
      where n.user_id = v_user and n.kind = 'RED_ALERT' and n.state = 'PENDING' and n.digest_id is not null
      limit 1;
    if v_digest is null then
      v_digest := gen_random_uuid();
      update public.case_line_notifications set digest_id = v_digest
        where user_id = v_user and kind = 'RED_ALERT' and state = 'PENDING' and next_attempt_at <= now();
    end if;
    v_lease := gen_random_uuid();
    update public.case_line_notifications set state = 'SENDING', attempts = attempts + 1,
      lease_id = v_lease, locked_until = now() + interval '2 minutes'
      where digest_id = v_digest and state = 'PENDING';

    return query
      select v_digest, v_lease, u.line_user_id,
        (select count(*)::int from public.case_line_notifications d where d.digest_id = v_digest and d.state = 'SENDING'),
        latest.case_code, latest.incident_type, latest.urgency, latest.district, latest.province
      from public.users u
      cross join lateral (
        select c.case_code, c.incident_type, c.urgency, c.district, c.province
        from public.case_line_notifications d join public.cases c on c.id = d.case_id
        where d.digest_id = v_digest and d.state = 'SENDING'
        order by d.seq desc limit 1
      ) latest
      where u.id = v_user;
  end loop;
end;
$$;

create function public.finish_red_alert_digest(
  p_digest_id uuid, p_lease_id uuid, p_result text, p_error text default null)
returns void language plpgsql set search_path = '' as $$
begin
  if p_result not in ('SENT', 'RETRY', 'FAILED', 'SKIPPED', 'RELEASE') then
    raise exception 'invalid result';
  end if;
  update public.case_line_notifications set
    state = case p_result
      when 'RETRY' then case when attempts < 5 then 'PENDING' else 'FAILED' end
      when 'RELEASE' then 'PENDING'
      else p_result end,
    attempts = case when p_result = 'RELEASE' then greatest(attempts - 1, 0) else attempts end,
    accepted_at = case when p_result in ('SENT', 'SKIPPED') then now() else null end,
    next_attempt_at = case when p_result = 'RELEASE' then next_attempt_at
      else now() + interval '1 minute' * power(2, least(attempts, 5)) end,
    locked_until = null, lease_id = null, last_error = left(p_error, 80)
    where digest_id = p_digest_id and lease_id = p_lease_id and state = 'SENDING';
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. จุดเชื่อมให้ TF-58: ขอให้ผู้แจ้งกดยืนยันปิดเคส (ยังไม่มีใครเรียก)
-- ----------------------------------------------------------------------------
create function public.enqueue_close_confirmation(p_case_id uuid)
returns boolean language plpgsql set search_path = '' as $$
begin
  insert into public.case_line_notifications(kind, case_id, user_id)
    select 'CLOSE_CONFIRM', c.id, u.id
    from public.cases c join public.users u on u.id = c.reporter_user_id
    where c.id = p_case_id and u.status = 'ACTIVE' and u.line_user_id ~ '^U[0-9a-fA-F]{32}$';
  return found;
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. โควตา LINE รายเดือนหมด: หยุดส่งทั้งระบบถึงต้นเดือนหน้า (เวลาไทย) และบันทึกให้แอดมินเห็น
-- ----------------------------------------------------------------------------
create table public.line_delivery_state (
  id boolean primary key default true check (id),
  paused_until timestamptz,
  reason text,
  updated_at timestamptz not null default now()
);
insert into public.line_delivery_state(id) values (true);
alter table public.line_delivery_state enable row level security;
revoke all on public.line_delivery_state from public, anon, authenticated;
grant all on public.line_delivery_state to service_role;
grant select on public.line_delivery_state to authenticated;
create policy "admin reads line delivery state" on public.line_delivery_state
  for select to authenticated using ((select rls.is_admin()));

create function public.is_line_delivery_paused() returns boolean
language sql stable set search_path = '' as $$
  select coalesce((select paused_until > now() from public.line_delivery_state where id), false)
$$;

create function public.pause_line_delivery(p_reason text)
returns timestamptz language plpgsql set search_path = '' as $$
declare
  v_until timestamptz :=
    (date_trunc('month', now() at time zone 'Asia/Bangkok') + interval '1 month') at time zone 'Asia/Bangkok';
  v_was_paused boolean;
begin
  select coalesce(paused_until > now(), false) into v_was_paused from public.line_delivery_state where id;
  update public.line_delivery_state
    set paused_until = v_until, reason = left(p_reason, 80), updated_at = now() where id;
  if not v_was_paused then
    insert into public.audit_logs(actor_user_id, action, target_type, metadata)
      values (null, 'LINE_DELIVERY_PAUSED', 'line_delivery',
        jsonb_build_object('reason', left(p_reason, 80), 'paused_until', v_until));
  end if;
  return v_until;
end;
$$;

-- ----------------------------------------------------------------------------
-- 9. สิทธิ์: ทุก RPC ของคิวใช้ได้เฉพาะ service_role (worker)
-- ----------------------------------------------------------------------------
revoke all on function public.skip_duplicate_case_line_notification() from public, anon, authenticated;
revoke all on function public.skip_duplicate_member_line_notification() from public, anon, authenticated;
revoke all on function public.claim_case_line_notifications() from public, anon, authenticated;
grant execute on function public.claim_case_line_notifications() to service_role;
revoke all on function public.claim_red_case_fanouts() from public, anon, authenticated;
grant execute on function public.claim_red_case_fanouts() to service_role;
revoke all on function public.list_red_alert_candidates(uuid) from public, anon, authenticated;
grant execute on function public.list_red_alert_candidates(uuid) to service_role;
revoke all on function public.enqueue_red_alerts(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.enqueue_red_alerts(uuid, uuid[]) to service_role;
revoke all on function public.claim_red_alert_digests() from public, anon, authenticated;
grant execute on function public.claim_red_alert_digests() to service_role;
revoke all on function public.finish_red_alert_digest(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.finish_red_alert_digest(uuid, uuid, text, text) to service_role;
revoke all on function public.enqueue_close_confirmation(uuid) from public, anon, authenticated;
grant execute on function public.enqueue_close_confirmation(uuid) to service_role;
revoke all on function public.is_line_delivery_paused() from public, anon, authenticated;
grant execute on function public.is_line_delivery_paused() to service_role;
revoke all on function public.pause_line_delivery(text) from public, anon, authenticated;
grant execute on function public.pause_line_delivery(text) to service_role;

-- ----------------------------------------------------------------------------
-- 10. ตัวเรียก worker: pg_cron ทุกนาที → pg_net POST /api/notifications/line
--     URL และ secret อยู่ใน Supabase Vault (ชื่อ line_worker_url, line_worker_secret) แยกต่อ project
--     ยังไม่ตั้ง Vault = ไม่ทำอะไร (เครื่องทีมและ CI ปลอดภัย)
-- ----------------------------------------------------------------------------
create extension if not exists pg_net;
create extension if not exists pg_cron;

create function public.run_line_worker() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'line_worker_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'line_worker_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    timeout_milliseconds := 30000
  );
end;
$$;
revoke all on function public.run_line_worker() from public, anon, authenticated;

select cron.schedule('tf34-line-worker', '* * * * *', 'select public.run_line_worker()');
select cron.schedule('tf34-line-queue-cleanup', '20 3 * * *', $cleanup$
  delete from public.case_line_notifications
    where created_at < now() - interval '30 days' and state not in ('PENDING', 'SENDING');
  delete from public.member_line_notifications
    where created_at < now() - interval '30 days' and state not in ('PENDING', 'SENDING');
  delete from public.line_red_case_queue
    where created_at < now() - interval '30 days';
$cleanup$);
