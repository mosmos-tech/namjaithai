-- TF-58: reporter confirmation and lead follow-up, enforced transactionally.
-- Confirmation capability is separate from the tracking token, which can be obtained with four phone digits.
create table rls.case_confirmation_secrets (
  case_id uuid primary key references public.cases(id) on delete cascade,
  secret text not null default encode(extensions.gen_random_bytes(16), 'hex')
);
revoke all on rls.case_confirmation_secrets from public, anon, authenticated;
insert into rls.case_confirmation_secrets(case_id) select id from public.cases;
create function rls.create_confirmation_secret() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into rls.case_confirmation_secrets(case_id) values (new.id);
  return new;
end $$;
revoke all on function rls.create_confirmation_secret() from public, anon, authenticated;
create trigger trg_case_confirmation_secret after insert on public.cases
for each row execute function rls.create_confirmation_secret();
create function public.confirmation_secret_for_case(p_case_code text) returns text
language sql stable security definer set search_path = '' as $$
  select s.secret from rls.case_confirmation_secrets s join public.cases c on c.id=s.case_id
  where c.case_code=upper(btrim(p_case_code))
$$;
revoke all on function public.confirmation_secret_for_case(text) from public, anon, authenticated;
grant execute on function public.confirmation_secret_for_case(text) to service_role;

alter table public.cases add column close_confirmation text
  check (close_confirmation in ('REPORTER_CONFIRMED', 'LEAD_UNCONFIRMED'));
create table public.case_lead_alerts (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id),
  unit_id uuid not null references public.units(id),
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz
);
alter table public.case_lead_alerts enable row level security;
revoke all on public.case_lead_alerts from public, anon, authenticated;

-- This narrowly scoped setting can only be set by the service-role RPC below.
create or replace function public.guard_case_status_transition() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status = 'AWAITING_CONFIRMATION' and new.status = 'NEW'
    and coalesce(current_setting('app.reporter_reopen', true), '') = 'on' then
    return new;
  end if;
  if not public.case_status_transition_allowed(old.status, new.status,
    coalesce(current_setting('app.case_release', true), '') = 'on',
    coalesce(current_setting('app.case_cancel_by_reporter', true), '') = 'on',
    coalesce(current_setting('app.case_close_by_lead', true), '') = 'on') then
    raise exception 'invalid case status transition % -> %', old.status, new.status using errcode = '23514';
  end if;
  return new;
end $$;

create function public.reporter_confirm_case(p_case_code text, p_token text, p_decision text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item public.cases%rowtype;
begin
  if p_decision is null or p_decision not in ('CONFIRM','NOT_RECEIVED') or p_token is null then
    raise exception 'invalid request' using errcode = '22023';
  end if;
  select * into item from public.cases where case_code = upper(btrim(p_case_code)) and exists (select 1 from rls.case_confirmation_secrets secret where secret.case_id = cases.id and secret.secret = p_token) for update;
  if not found then raise exception 'not found' using errcode = '42501'; end if;
  if item.status <> 'AWAITING_CONFIRMATION' then return jsonb_build_object('status','STALE'); end if;
  if p_decision = 'CONFIRM' then
    perform set_config('app.case_close_by_lead', 'on', true);
    update public.cases set status='RESOLVED', close_confirmation='REPORTER_CONFIRMED',
      resolved_at=now(), closed_at=now(), last_status_updated_at=now(), version=version+1 where id=item.id;
  else
    perform set_config('app.reporter_reopen', 'on', true);
    update public.cases set status='NEW', assigned_rescuer_id=null,
      assigned_unit_id=case when item.is_demo then item.assigned_unit_id else null end,
      accepted_at=null, last_status_updated_at=now(), version=version+1 where id=item.id;
    if item.assigned_unit_id is not null then
      insert into public.case_lead_alerts(case_id,unit_id) values(item.id,item.assigned_unit_id);
    end if;
  end if;
  insert into public.case_events(case_id,event_type,from_status,to_status,actor_role,actor_unit_id,note)
    values(item.id,'STATUS_CHANGED',item.status,case when p_decision='CONFIRM' then 'RESOLVED'::public.case_status else 'NEW'::public.case_status end,
      'REPORTER',item.assigned_unit_id,case when p_decision='CONFIRM' then 'ผู้แจ้งยืนยันว่าได้รับความช่วยเหลือ' else 'ผู้แจ้งระบุว่ายังไม่ได้รับความช่วยเหลือ' end);
  insert into public.audit_logs(action,target_type,target_id,case_id,metadata)
    values('REPORTER_CONFIRMATION','case',item.id,item.id,jsonb_build_object('decision',p_decision));
  return jsonb_build_object('status',case when p_decision='CONFIRM' then 'RESOLVED' else 'NEW' end);
end $$;
revoke all on function public.reporter_confirm_case(text,text,text) from public, anon, authenticated;
grant execute on function public.reporter_confirm_case(text,text,text) to service_role;

-- Waiting cases enter the queue by timestamp; no scheduler or automatic closure is required.
create function public.lead_confirmation_queue()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if rls.current_user_id() is null or (not rls.is_admin() and not exists(select 1 from rls.my_unit_ids(true))) then
    raise exception 'forbidden' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at), '[]'::jsonb) into result from (
    select c.id, c.case_code, c.assigned_unit_id as unit_id, 'OVERDUE'::text as kind, c.last_status_updated_at as created_at
    from public.cases c where c.status='AWAITING_CONFIRMATION' and c.last_status_updated_at <= now()-interval '24 hours'
      and (rls.is_admin() or c.assigned_unit_id in (select rls.my_unit_ids(true)))
    union all
    select c.id, c.case_code, a.unit_id, 'NOT_RECEIVED'::text, a.created_at
    from public.case_lead_alerts a join public.cases c on c.id=a.case_id
    where a.acknowledged_at is null and (rls.is_admin() or a.unit_id in (select rls.my_unit_ids(true)))
  ) q;
  return result;
end $$;

create function public.lead_confirm_unverified(p_case_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item public.cases%rowtype; actor uuid := rls.current_user_id();
begin
  select * into item from public.cases where id=p_case_id for update;
  if not found or actor is null or not coalesce(rls.is_admin() or item.assigned_unit_id in (select rls.my_unit_ids(true)), false) then
    raise exception 'forbidden' using errcode='42501';
  end if;
  if item.status <> 'AWAITING_CONFIRMATION' or item.last_status_updated_at > now()-interval '24 hours' then
    raise exception 'not overdue' using errcode='22023';
  end if;
  perform set_config('app.case_close_by_lead','on',true);
  update public.cases set status='RESOLVED',close_confirmation='LEAD_UNCONFIRMED',resolved_at=now(),closed_at=now(),
    last_status_updated_at=now(),version=version+1 where id=item.id;
  insert into public.case_events(case_id,event_type,from_status,to_status,actor_user_id,actor_unit_id,actor_role,note)
    values(item.id,'STATUS_CHANGED',item.status,'RESOLVED',actor,item.assigned_unit_id,
      case when rls.is_admin() then 'ADMIN' else 'UNIT_LEAD' end,'ปิดโดยไม่ได้รับการยืนยันจากผู้แจ้งหลัง 24 ชั่วโมง');
  insert into public.audit_logs(actor_user_id,action,target_type,target_id,case_id,metadata)
    values(actor,'CLOSE_UNCONFIRMED','case',item.id,item.id,jsonb_build_object('confirmation','LEAD_UNCONFIRMED'));
  return jsonb_build_object('status','RESOLVED');
end $$;
create function public.acknowledge_lead_alert(p_case_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if rls.current_user_id() is null then raise exception 'forbidden' using errcode='42501'; end if;
  update public.case_lead_alerts set acknowledged_at=now() where case_id=p_case_id and acknowledged_at is null
    and (rls.is_admin() or unit_id in (select rls.my_unit_ids(true)));
end $$;
revoke all on function public.lead_confirmation_queue() from public, anon;
revoke all on function public.lead_confirm_unverified(uuid) from public, anon;
revoke all on function public.acknowledge_lead_alert(uuid) from public, anon;
grant execute on function public.lead_confirmation_queue() to authenticated;
grant execute on function public.lead_confirm_unverified(uuid) to authenticated;
grant execute on function public.acknowledge_lead_alert(uuid) to authenticated;
