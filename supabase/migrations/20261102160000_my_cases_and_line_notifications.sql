-- TF-43: even admins/rescuers get only their own reports from this RPC.
create function public.get_my_cases(p_offset integer default 0)
returns table(case_code text, tracking_token text, status public.case_status,
  urgency public.urgency_level, created_at timestamptz, province text, district text, subdistrict text)
language sql stable set search_path = '' as $$
  select c.case_code, c.tracking_token, c.status, c.urgency, c.created_at,
    c.province, c.district, c.subdistrict
  from public.cases c where c.reporter_user_id = rls.current_user_id()
  order by c.created_at desc, c.id desc limit 21 offset greatest(0, p_offset)
$$;
revoke all on function public.get_my_cases(integer) from public, anon;
grant execute on function public.get_my_cases(integer) to authenticated;
create index if not exists idx_cases_reporter_created on public.cases(reporter_user_id, created_at desc, id desc);

-- Transactional outbox. No browser access to recipients, retry state or delivery jobs.
create table public.case_line_notifications (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity unique,
  case_id uuid not null references public.cases(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  to_status public.case_status not null,
  state text not null default 'PENDING' check(state in ('PENDING', 'SENDING', 'SENT', 'FAILED')),
  attempts integer not null default 0,
  lease_id uuid,
  locked_until timestamptz,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  last_error text
);
alter table public.case_line_notifications enable row level security;
revoke all on public.case_line_notifications from public, anon, authenticated;
grant all on public.case_line_notifications to service_role;
create index idx_line_notification_pending on public.case_line_notifications(state, next_attempt_at, seq);

create function public.enqueue_case_line_notification() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status is distinct from new.status and new.reporter_user_id is not null then
    insert into public.case_line_notifications(case_id, user_id, to_status)
      select new.id, u.id, new.status from public.users u
      where u.id = new.reporter_user_id and u.status = 'ACTIVE' and u.line_user_id ~ '^U[0-9a-fA-F]{32}$';
  end if;
  return new;
end;
$$;
revoke all on function public.enqueue_case_line_notification() from public, anon, authenticated;
create trigger trg_case_line_notification after update of status on public.cases
  for each row execute function public.enqueue_case_line_notification();

create function public.claim_case_line_notifications()
returns table(id uuid, lease_id uuid, line_user_id text, case_code text, tracking_token text,
  to_status public.case_status, created_at timestamptz)
language plpgsql set search_path = '' as $$
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
    where n.state in ('PENDING', 'SENDING') and n.next_attempt_at <= now()
      and (n.locked_until is null or n.locked_until < now())
      and not exists (select 1 from public.case_line_notifications prior
        where prior.case_id = n.case_id and prior.seq < n.seq and prior.state in ('PENDING', 'SENDING'))
    order by n.seq limit 10 for update skip locked
  ), leased as (
    update public.case_line_notifications n set state = 'SENDING', attempts = n.attempts + 1,
      lease_id = gen_random_uuid(), locked_until = now() + interval '2 minutes'
    from picked where n.id = picked.id returning n.*
  ) select n.id, n.lease_id, u.line_user_id, c.case_code, c.tracking_token, n.to_status, n.created_at
    from leased n join public.users u on u.id = n.user_id join public.cases c on c.id = n.case_id order by n.seq;
end;
$$;

create function public.finish_case_line_notification(p_id uuid, p_lease_id uuid, p_result text, p_error text default null)
returns void language plpgsql set search_path = '' as $$
begin
  if p_result not in ('SENT', 'RETRY', 'FAILED') then raise exception 'invalid result'; end if;
  update public.case_line_notifications set
    state = case when p_result = 'RETRY' and attempts < 5 then 'PENDING'
      when p_result = 'RETRY' then 'FAILED' else p_result end,
    accepted_at = case when p_result = 'SENT' then now() else null end,
    next_attempt_at = now() + interval '1 minute' * power(2, least(attempts, 5)),
    locked_until = null, lease_id = null, last_error = left(p_error, 80)
    where id = p_id and lease_id = p_lease_id and state = 'SENDING';
end;
$$;
revoke all on function public.claim_case_line_notifications() from public, anon, authenticated;
revoke all on function public.finish_case_line_notification(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_case_line_notifications() to service_role;
grant execute on function public.finish_case_line_notification(uuid, uuid, text, text) to service_role;
