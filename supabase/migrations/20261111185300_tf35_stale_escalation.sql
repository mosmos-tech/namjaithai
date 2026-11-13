-- TF-35: detect stale cases once per activity period. Demo cases must never be processed.
create table public.case_stale_alerts (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  kind text not null check (kind in ('UNCLAIMED', 'TEAM_SILENT')),
  activity_at timestamptz not null,
  unit_id uuid references public.units(id),
  rescuer_id uuid references public.users(id),
  created_at timestamptz not null default now(),
  unique (case_id, kind, activity_at)
);
alter table public.case_stale_alerts enable row level security;
revoke all on public.case_stale_alerts from public, anon, authenticated;

-- Serialize case notes with the stale-case worker so a concurrent update is not lost.
create function public.tf35_lock_case_note() returns trigger language plpgsql set search_path='' as $$
declare item public.cases%rowtype;
begin
  if new.event_type = 'NOTE_ADDED' then
    select * into item from public.cases where id = new.case_id for update;
    if item.status is distinct from new.from_status or item.assigned_unit_id is distinct from new.actor_unit_id then
      raise exception 'case changed while adding note' using errcode='40001';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.tf35_lock_case_note() from public, anon, authenticated;
create trigger tf35_lock_case_note before insert on public.case_events for each row execute function public.tf35_lock_case_note();

-- Only the worker may release ON_SITE; the ordinary manual transition rules remain unchanged.
create or replace function public.guard_case_status_transition() returns trigger
language plpgsql set search_path='' as $$
begin
  if old.status='AWAITING_CONFIRMATION' and new.status='NEW'
    and coalesce(current_setting('app.reporter_reopen',true),'')='on' then return new; end if;
  if old.status='ON_SITE' and new.status='NEW'
    and coalesce(current_setting('app.tf35_stale_release',true),'')='on' then return new; end if;
  if not public.case_status_transition_allowed(old.status,new.status,
    coalesce(current_setting('app.case_release',true),'')='on',
    coalesce(current_setting('app.case_cancel_by_reporter',true),'')='on',
    coalesce(current_setting('app.case_close_by_lead',true),'')='on') then
    raise exception 'invalid case status transition % -> %',old.status,new.status using errcode='23514';
  end if;
  return new;
end $$;

create function public.tf35_escalate_stale_cases() returns void
language plpgsql security definer set search_path='' as $$
declare item public.cases%rowtype; activity timestamptz; new_version integer;
begin
  perform set_config('app.case_release','on',true);
  perform set_config('app.tf35_stale_release','on',true);
  for item in select c.* from public.cases c where not c.is_demo and (
      (c.status='NEW' and ((c.urgency='RED' and c.last_status_updated_at <= now()-interval '10 minutes')
        or (c.urgency='YELLOW' and c.last_status_updated_at <= now()-interval '30 minutes')))
      or (c.status in ('ACCEPTED','EN_ROUTE','ON_SITE') and c.last_status_updated_at <= now()-interval '15 minutes')
    ) for update skip locked
  loop
    activity := item.last_status_updated_at;
    if item.status='NEW' then
      insert into public.case_stale_alerts(case_id,kind,activity_at) values(item.id,'UNCLAIMED',activity) on conflict do nothing;
    else
      select greatest(item.last_status_updated_at,coalesce(max(e.created_at),item.last_status_updated_at)) into activity
        from public.case_events e where e.case_id=item.id and e.event_type in ('NOTE_ADDED','ASSIGNED')
          and e.actor_unit_id=item.assigned_unit_id and e.created_at >= item.last_status_updated_at;
      if activity <= now()-interval '15 minutes' then
        insert into public.case_stale_alerts(case_id,kind,activity_at,unit_id,rescuer_id)
          values(item.id,'TEAM_SILENT',activity,item.assigned_unit_id,item.assigned_rescuer_id) on conflict do nothing;
      end if;
      if activity <= now()-interval '20 minutes' then
        update public.cases set status='NEW',assigned_unit_id=null,assigned_rescuer_id=null,accepted_at=null,
          last_status_updated_at=now(),version=version+1 where id=item.id returning version into new_version;
        insert into public.case_events(case_id,event_type,from_status,to_status,actor_unit_id,actor_role,note,metadata)
          values(item.id,'AUTO_ESCALATED',item.status,'NEW',item.assigned_unit_id,'SYSTEM','ไม่มีการอัปเดตจากทีมเกิน 20 นาที',jsonb_build_object('version',new_version,'rescuer_id',item.assigned_rescuer_id));
        insert into public.audit_logs(action,target_type,target_id,case_id,metadata)
          values('CASE_AUTO_ESCALATED','case',item.id,item.id,jsonb_build_object('unit_id',item.assigned_unit_id,'rescuer_id',item.assigned_rescuer_id));
        if item.urgency='RED' then
          begin
            insert into public.line_red_case_queue as q(case_id,alert_round,exclude_user_id)
              values(item.id,1,item.assigned_rescuer_id) on conflict(case_id) do update
              set processed_at=null,created_at=now(),alert_round=q.alert_round+1,exclude_user_id=excluded.exclude_user_id;
          exception when others then
            raise warning 'tf35 red queue failed: %', sqlerrm;
          end;
        end if;
      end if;
    end if;
  end loop;
end $$;
revoke all on function public.tf35_escalate_stale_cases() from public,anon,authenticated;
grant execute on function public.tf35_escalate_stale_cases() to service_role;
select cron.schedule('tf35-stale-cases','* * * * *','select public.tf35_escalate_stale_cases()');

-- Expose only live, relevant alerts; no contact information or tracking token.
create function public.tf35_stale_alerts() returns table(id uuid,case_id uuid,case_code text,kind text,created_at timestamptz)
language sql stable security definer set search_path='' as $$
  select a.id,c.id,c.case_code,a.kind,a.created_at
  from public.case_stale_alerts a join public.cases c on c.id=a.case_id
  where not c.is_demo and (
    (a.kind='UNCLAIMED' and rls.is_admin() and c.status='NEW' and c.last_status_updated_at=a.activity_at)
    or (a.kind='TEAM_SILENT' and c.status in ('ACCEPTED','EN_ROUTE','ON_SITE')
      and c.assigned_unit_id=a.unit_id and c.assigned_rescuer_id is not distinct from a.rescuer_id
      and (rls.is_admin() or (exists(select 1 from public.users u where u.id=rls.current_user_id() and u.role in ('RESCUER','UNIT_LEAD')) and ((a.rescuer_id=rls.current_user_id() and a.unit_id in (select rls.my_unit_ids())) or a.unit_id in (select rls.my_unit_ids(true)))))
      and not exists(select 1 from public.case_events e where e.case_id=c.id and e.event_type in ('NOTE_ADDED','ASSIGNED')
        and e.actor_unit_id=a.unit_id and e.created_at > a.activity_at)
      and c.last_status_updated_at <= a.activity_at)
  ) order by a.created_at desc limit 100;
$$;
revoke all on function public.tf35_stale_alerts() from public,anon;
grant execute on function public.tf35_stale_alerts() to authenticated;

-- TF-34 LINE outbox: stale alerts contain no reporter contact or tracking link.
alter table public.case_line_notifications drop constraint case_line_notifications_kind_check;
alter table public.case_line_notifications add constraint case_line_notifications_kind_check
  check(kind in ('CASE_STATUS','RED_ALERT','CLOSE_CONFIRM','STALE_UNCLAIMED','STALE_TEAM'));
alter table public.case_line_notifications add column stale_alert_id uuid references public.case_stale_alerts(id) on delete cascade;
create function public.tf35_alert_is_current(p_alert_id uuid) returns boolean
language sql stable set search_path='' as $$
  select exists(select 1 from public.case_stale_alerts a join public.cases c on c.id=a.case_id
    where a.id=p_alert_id and not c.is_demo and (
      (a.kind='UNCLAIMED' and c.status='NEW' and c.last_status_updated_at=a.activity_at)
      or (a.kind='TEAM_SILENT' and c.status in ('ACCEPTED','EN_ROUTE','ON_SITE')
        and c.assigned_unit_id=a.unit_id and c.assigned_rescuer_id is not distinct from a.rescuer_id
        and c.last_status_updated_at <= a.activity_at
        and not exists(select 1 from public.case_events e where e.case_id=c.id and e.event_type in ('NOTE_ADDED','ASSIGNED')
          and e.actor_unit_id=a.unit_id and e.created_at>a.activity_at))));
$$;
revoke all on function public.tf35_alert_is_current(uuid) from public,anon,authenticated;
grant execute on function public.tf35_alert_is_current(uuid) to service_role;

create function public.tf35_enqueue_line_alert() returns trigger language plpgsql security definer set search_path='' as $$
begin
  begin
  insert into public.case_line_notifications(kind,case_id,user_id,stale_alert_id)
  select distinct case when new.kind='UNCLAIMED' then 'STALE_UNCLAIMED' else 'STALE_TEAM' end,
    new.case_id,u.id,new.id
  from public.users u
  where u.status='ACTIVE' and u.line_user_id ~ '^U[0-9a-fA-F]{32}$'
    and ((new.kind='UNCLAIMED' and u.role='ADMIN')
      or (new.kind='TEAM_SILENT' and u.role in ('RESCUER','UNIT_LEAD') and exists(
        select 1 from public.unit_members m join public.units unit on unit.id=m.unit_id and unit.is_active
        where m.unit_id=new.unit_id and m.user_id=u.id and m.status='APPROVED'
          and (m.expires_at is null or m.expires_at>now())
          and (u.id=new.rescuer_id or m.role_in_unit='LEAD'))));
  exception when others then
    raise warning 'tf35 LINE queue failed: %', sqlerrm;
  end;
  return new;
end $$;
revoke all on function public.tf35_enqueue_line_alert() from public,anon,authenticated;
create trigger tf35_enqueue_line_alert after insert on public.case_stale_alerts for each row execute function public.tf35_enqueue_line_alert();
-- Recheck the recipient at delivery time so revoked roles or memberships receive nothing.
create function public.tf35_line_recipient_allowed(p_alert_id uuid,p_user_id uuid) returns boolean
language sql stable set search_path='' as $$
  select exists(select 1 from public.case_stale_alerts a join public.users u on u.id=p_user_id
    where a.id=p_alert_id and u.status='ACTIVE' and (
      (a.kind='UNCLAIMED' and u.role='ADMIN') or
      (a.kind='TEAM_SILENT' and u.role in ('RESCUER','UNIT_LEAD') and exists(
        select 1 from public.unit_members m join public.units unit on unit.id=m.unit_id and unit.is_active
        where m.unit_id=a.unit_id and m.user_id=u.id and m.status='APPROVED'
          and (m.expires_at is null or m.expires_at>now())
          and (u.id=a.rescuer_id or m.role_in_unit='LEAD')))));
$$;
revoke all on function public.tf35_line_recipient_allowed(uuid,uuid) from public,anon,authenticated;
grant execute on function public.tf35_line_recipient_allowed(uuid,uuid) to service_role;

create or replace function public.claim_case_line_notifications()
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
  -- Do not send obsolete alerts after a case was picked up or the team updated it.
  update public.case_line_notifications n set state='SKIPPED', last_error='stale_alert_resolved'
    where n.kind in ('STALE_UNCLAIMED','STALE_TEAM') and n.state in ('PENDING','SENDING')
      and (n.locked_until is null or n.locked_until < now())
      and (not public.tf35_alert_is_current(n.stale_alert_id) or not public.tf35_line_recipient_allowed(n.stale_alert_id,n.user_id));
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
