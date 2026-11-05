-- ============================================================================
-- TF-20: คิวอนุมัติและระงับสมาชิก (90 วัน, บันทึก audit_logs, และคิวแจ้งผลทาง LINE)
-- ============================================================================

set search_path = public, extensions;

-- ----------------------------------------------------------------------------
-- 1. ปรับฟังก์ชันเช็กสิทธิ์เคสให้กู้ภัยที่ถูกระงับ/ปฏิเสธ/หมดอายุ 90 วัน หลุดสิทธิ์ทันที
--    แม้เคยได้รับมอบหมายเคสนั้นมาก่อน
-- ----------------------------------------------------------------------------
create or replace function rls.can_see_case(p_case_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select rls.is_admin() or exists (
    select 1 from public.cases c
    where c.id = p_case_id
      and (
        c.reporter_user_id = rls.current_user_id()
        or (
          c.assigned_rescuer_id = rls.current_user_id()
          and exists (select 1 from rls.my_unit_ids())
        )
        or c.assigned_unit_id in (select rls.my_unit_ids())
        or c.province in (select rls.my_provinces())
      )
  )
$$;

create or replace function rls.can_see_case_private(p_case_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select rls.is_admin() or exists (
    select 1 from public.cases c
    where c.id = p_case_id
      and (
        (
          c.assigned_rescuer_id = rls.current_user_id()
          and exists (select 1 from rls.my_unit_ids())
        )
        or c.reporter_user_id = rls.current_user_id()
      )
  )
$$;

drop policy if exists "read visible cases" on public.cases;
create policy "read visible cases" on public.cases
  for select to authenticated
  using (
    (select rls.is_admin())
    or reporter_user_id = (select rls.current_user_id())
    or (
      assigned_rescuer_id = (select rls.current_user_id())
      and exists (select 1 from rls.my_unit_ids())
    )
    or assigned_unit_id in (select rls.my_unit_ids())
    or province in (select rls.my_provinces())
  );

-- หัวหน้าหน่วยอ่านประวัติการอนุมัติ/ระงับสมาชิกของหน่วยตัวเองได้ (ส่วนเคสและหน่วยอื่นไม่เห็น)
drop policy if exists "lead reads own unit member audit logs" on public.audit_logs;
create policy "lead reads own unit member audit logs" on public.audit_logs
  for select to authenticated
  using (
    target_type = 'unit_member'
    and (metadata ->> 'unit_id') is not null
    and ((metadata ->> 'unit_id')::uuid in (select rls.my_unit_ids(true)))
  );

-- ----------------------------------------------------------------------------
-- 2. ตารางคิวแจ้งผลการอนุมัติ/ปฏิเสธ/ระงับสมาชิกทาง LINE (Transactional Outbox)
-- ----------------------------------------------------------------------------
create table if not exists public.member_line_notifications (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity unique,
  unit_member_id uuid not null references public.unit_members(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  to_status public.unit_member_status not null check (to_status in ('APPROVED', 'REJECTED', 'SUSPENDED')),
  expires_at timestamptz,
  state text not null default 'PENDING' check (state in ('PENDING', 'SENDING', 'SENT', 'FAILED')),
  attempts integer not null default 0,
  lease_id uuid,
  locked_until timestamptz,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  last_error text
);

alter table public.member_line_notifications enable row level security;
revoke all on public.member_line_notifications from public, anon, authenticated;
grant all on public.member_line_notifications to service_role;

create index if not exists idx_member_line_notification_pending
  on public.member_line_notifications (state, next_attempt_at, seq);

-- ----------------------------------------------------------------------------
-- 3. Trigger บน public.unit_members:
--    - กำหนดวันหมดอายุสิทธิ์ 90 วันอัตโนมัติเมื่ออนุมัติ (APPROVED)
--    - ล้างสถานะปฏิบัติงานและวันหมดอายุเมื่อปฏิเสธ/ระงับ (REJECTED / SUSPENDED)
--    - ซิงก์บทบาทใน public.users ทันที (RESCUER <-> USER)
--    - บันทึกทุกการอนุมัติ/ปฏิเสธ/ระงับลง public.audit_logs
--    - สร้างงานแจ้งผลทาง LINE ใน public.member_line_notifications
-- ----------------------------------------------------------------------------
create or replace function public.prepare_unit_member_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'APPROVED' and (tg_op = 'INSERT' or old.status is distinct from 'APPROVED') then
    new.approved_at := coalesce(new.approved_at, now());
    new.approved_by := coalesce(new.approved_by, rls.current_user_id());
    if tg_op = 'INSERT' then
      new.expires_at := coalesce(new.expires_at, now() + interval '90 days');
    elsif new.expires_at is null or new.expires_at is not distinct from old.expires_at then
      new.expires_at := now() + interval '90 days';
    end if;
  elsif new.status in ('REJECTED', 'SUSPENDED')
        and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    new.is_on_duty := false;
    new.duty_status := 'OFFLINE';
    new.expires_at := null;
  end if;
  return new;
end;
$$;

revoke all on function public.prepare_unit_member_status_change() from public, anon, authenticated;

drop trigger if exists trg_unit_members_prepare_status on public.unit_members;
create trigger trg_unit_members_prepare_status
  before insert or update on public.unit_members
  for each row execute function public.prepare_unit_member_status_change();

create or replace function public.record_unit_member_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := coalesce(rls.current_user_id(), new.approved_by);
  v_action text;
begin
  if old.status is distinct from new.status
     and new.status in ('APPROVED', 'REJECTED', 'SUSPENDED') then
    v_action := case new.status
      when 'APPROVED' then 'MEMBER_APPROVED'
      when 'REJECTED' then 'MEMBER_REJECTED'
      when 'SUSPENDED' then 'MEMBER_SUSPENDED'
    end;

    insert into public.audit_logs (
      actor_user_id,
      action,
      target_type,
      target_id,
      target_user_id,
      metadata
    ) values (
      v_actor_id,
      v_action,
      'unit_member',
      new.id,
      new.user_id,
      jsonb_build_object(
        'unit_id', new.unit_id,
        'from_status', old.status,
        'to_status', new.status,
        'expires_at', new.expires_at
      )
    );

    if new.status = 'APPROVED' then
      update public.users
      set role = 'RESCUER', updated_at = now()
      where id = new.user_id and role = 'USER';
    else
      if not exists (
        select 1
        from public.unit_members m
        join public.units u on u.id = m.unit_id and u.is_active
        where m.user_id = new.user_id
          and m.id <> new.id
          and m.status = 'APPROVED'
          and (m.expires_at is null or m.expires_at > now())
      ) then
        update public.users
        set role = 'USER', updated_at = now()
        where id = new.user_id and role = 'RESCUER';
      end if;
    end if;

    insert into public.member_line_notifications (
      unit_member_id,
      unit_id,
      user_id,
      to_status,
      expires_at
    )
    select new.id, new.unit_id, u.id, new.status, new.expires_at
    from public.users u
    where u.id = new.user_id
      and u.status = 'ACTIVE'
      and u.line_user_id ~ '^U[0-9a-fA-F]{32}$';
  end if;

  return new;
end;
$$;

revoke all on function public.record_unit_member_status_change() from public, anon, authenticated;

drop trigger if exists trg_unit_members_record_status on public.unit_members;
create trigger trg_unit_members_record_status
  after update of status on public.unit_members
  for each row execute function public.record_unit_member_status_change();

-- ----------------------------------------------------------------------------
-- 4. RPC สำหรับหัวหน้าหน่วย/แอดมิน กดอนุมัติ/ปฏิเสธ/ระงับสมาชิกทีละคนหรือหลายคน
-- ----------------------------------------------------------------------------
create or replace function public.review_unit_members(
  p_unit_id uuid,
  p_member_ids uuid[],
  p_decision public.unit_member_status
)
returns table (
  id uuid,
  unit_id uuid,
  user_id uuid,
  status public.unit_member_status,
  approved_by uuid,
  approved_at timestamptz,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := rls.current_user_id();
begin
  if v_actor_id is null then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  if not (rls.is_admin() or p_unit_id in (select rls.my_unit_ids(true))) then
    raise exception 'permission denied for unit' using errcode = '42501';
  end if;

  if p_decision not in ('APPROVED', 'REJECTED', 'SUSPENDED') then
    raise exception 'invalid decision' using errcode = '22023';
  end if;

  if coalesce(array_length(p_member_ids, 1), 0) = 0 then
    raise exception 'member_ids required' using errcode = '22023';
  end if;

  return query
  update public.unit_members m
  set status = p_decision,
      approved_by = case when p_decision = 'APPROVED' then v_actor_id else m.approved_by end,
      approved_at = case when p_decision = 'APPROVED' then now() else m.approved_at end,
      expires_at = case when p_decision = 'APPROVED' then now() + interval '90 days' else null end,
      updated_at = now()
  where m.unit_id = p_unit_id
    and m.id = any(p_member_ids)
    and m.role_in_unit = 'MEMBER'
    and m.status is distinct from p_decision
  returning m.id, m.unit_id, m.user_id, m.status, m.approved_by, m.approved_at, m.expires_at;
end;
$$;

revoke all on function public.review_unit_members(uuid, uuid[], public.unit_member_status) from public, anon;
grant execute on function public.review_unit_members(uuid, uuid[], public.unit_member_status) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. RPC สำหรับ Worker ส่งแจ้งเตือนผลอนุมัติ/ปฏิเสธ/ระงับสมาชิกทาง LINE
-- ----------------------------------------------------------------------------
create or replace function public.claim_member_line_notifications()
returns table (
  id uuid,
  lease_id uuid,
  line_user_id text,
  unit_name text,
  to_status public.unit_member_status,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
set search_path = ''
as $$
begin
  update public.member_line_notifications n
  set state = 'FAILED', last_error = 'retry_limit'
  where n.state in ('PENDING', 'SENDING')
    and (n.attempts >= 5 or n.created_at < now() - interval '23 hours')
    and (n.locked_until is null or n.locked_until < now());

  update public.member_line_notifications n
  set state = 'FAILED', last_error = 'recipient_unavailable'
  where n.state in ('PENDING', 'SENDING')
    and not exists (
      select 1 from public.users u
      where u.id = n.user_id
        and u.status = 'ACTIVE'
        and u.line_user_id ~ '^U[0-9a-fA-F]{32}$'
    );

  return query
  with picked as (
    select n.id
    from public.member_line_notifications n
    where n.state in ('PENDING', 'SENDING')
      and n.next_attempt_at <= now()
      and (n.locked_until is null or n.locked_until < now())
      and not exists (
        select 1 from public.member_line_notifications prior
        where prior.unit_member_id = n.unit_member_id
          and prior.seq < n.seq
          and prior.state in ('PENDING', 'SENDING')
      )
    order by n.seq
    limit 10
    for update skip locked
  ), leased as (
    update public.member_line_notifications n
    set state = 'SENDING',
        attempts = n.attempts + 1,
        lease_id = gen_random_uuid(),
        locked_until = now() + interval '2 minutes'
    from picked
    where n.id = picked.id
    returning n.*
  )
  select
    n.id,
    n.lease_id,
    u.line_user_id,
    un.name as unit_name,
    n.to_status,
    n.expires_at,
    n.created_at
  from leased n
  join public.users u on u.id = n.user_id
  join public.units un on un.id = n.unit_id
  order by n.seq;
end;
$$;

create or replace function public.finish_member_line_notification(
  p_id uuid,
  p_lease_id uuid,
  p_result text,
  p_error text default null
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_result not in ('SENT', 'RETRY', 'FAILED') then
    raise exception 'invalid result';
  end if;

  update public.member_line_notifications
  set state = case
        when p_result = 'RETRY' and attempts < 5 then 'PENDING'
        when p_result = 'RETRY' then 'FAILED'
        else p_result
      end,
      accepted_at = case when p_result = 'SENT' then now() else null end,
      next_attempt_at = now() + interval '1 minute' * power(2, least(attempts, 5)),
      locked_until = null,
      lease_id = null,
      last_error = left(p_error, 80)
  where id = p_id
    and lease_id = p_lease_id
    and state = 'SENDING';
end;
$$;

revoke all on function public.claim_member_line_notifications() from public, anon, authenticated;
revoke all on function public.finish_member_line_notification(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_member_line_notifications() to service_role;
grant execute on function public.finish_member_line_notification(uuid, uuid, text, text) to service_role;
