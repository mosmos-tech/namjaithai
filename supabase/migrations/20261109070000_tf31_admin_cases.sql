-- TF-31: atomic administrator actions. No contact details leave these functions.
create table rls.case_merged_contacts (
  original_case_id uuid not null references public.cases(id),
  contact_id uuid not null references public.case_contacts(id) on delete cascade,
  primary key (original_case_id, contact_id)
);
alter table rls.case_merged_contacts enable row level security;
revoke all on rls.case_merged_contacts from public, anon, authenticated;
grant usage on schema rls to service_role;
grant select on rls.case_merged_contacts to service_role;

create function public.admin_nearby_cases(p_case_id uuid)
returns table (id uuid, case_code text, status public.case_status, distance_m double precision)
language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce(rls.is_admin(), false) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select c.id, c.case_code, c.status, extensions.st_distance(c.location, origin.location)
    from public.cases origin join public.cases c on c.id <> origin.id
    where origin.id = p_case_id and c.is_demo = origin.is_demo
      and c.status not in ('RESOLVED','CANCELLED','DUPLICATE','UNREACHABLE')
      and extensions.st_dwithin(c.location, origin.location, 50)
    order by extensions.st_distance(c.location, origin.location), c.id limit 100;
end $$;

create function public.admin_case_action(p_action text, p_case_id uuid, p_version integer,
  p_unit_id uuid default null, p_primary_id uuid default null, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := rls.current_user_id();
  item public.cases%rowtype;
  primary_case public.cases%rowtype;
  reason text := btrim(coalesce(p_reason,''));
  event public.case_event_type;
begin
  if actor is null or not coalesce(rls.is_admin(), false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_action = 'merge' then
    if p_primary_id is null or p_primary_id = p_case_id then raise exception 'invalid primary' using errcode = '22023'; end if;
    perform 1 from public.cases where id in (p_case_id, p_primary_id) order by id for update;
    select * into primary_case from public.cases where id = p_primary_id;
    if not found or primary_case.status in ('RESOLVED','CANCELLED','DUPLICATE','UNREACHABLE') then
      raise exception 'primary unavailable' using errcode = '22023';
    end if;
  else
    perform 1 from public.cases where id = p_case_id for update;
  end if;
  select * into item from public.cases where id = p_case_id;
  if not found or item.version is distinct from p_version then raise exception 'stale case' using errcode = '40001'; end if;
  if item.status in ('RESOLVED','CANCELLED','DUPLICATE','UNREACHABLE') then
    raise exception 'case closed' using errcode = '22023';
  end if;
  if p_action = 'assign' then
    if item.status <> 'NEW' then raise exception 'only unclaimed cases can be assigned' using errcode = '22023'; end if;
    if not exists (select 1 from public.units u where u.id = p_unit_id and u.is_active
      and u.source <> 'OSM' and (not item.is_demo or u.source = 'DEMO')
      and (item.is_demo or u.source <> 'DEMO')) then raise exception 'invalid unit' using errcode = '22023'; end if;
    update public.cases set assigned_unit_id = p_unit_id, version = version + 1 where id = item.id;
    event := 'ASSIGNED';
  elsif p_action = 'unreachable' then
    if char_length(reason) not between 3 and 300 then raise exception 'reason required' using errcode = '22023'; end if;
    perform set_config('app.case_close_by_lead','on',true);
    update public.cases set status = 'UNREACHABLE', resolution_note = reason, closed_at = now(),
      last_status_updated_at = now(), version = version + 1 where id = item.id;
    event := 'MARKED_UNREACHABLE';
  elsif p_action = 'merge' then
    if item.is_demo <> primary_case.is_demo or not extensions.st_dwithin(item.location, primary_case.location, 50) then
      raise exception 'cases must be within 50m and of the same kind' using errcode = '22023';
    end if;
    -- Retain the association for the secondary case's phone-based tracking lookup.
    insert into rls.case_merged_contacts(original_case_id,contact_id)
      select item.id, id from public.case_contacts where case_id = item.id on conflict do nothing;
    update public.case_contacts set case_id = primary_case.id, is_primary = false where case_id = item.id;
    update public.case_media set case_id = primary_case.id where case_id = item.id;
    perform set_config('app.case_close_by_lead','on',true);
    update public.cases set status = 'DUPLICATE', duplicate_of_case_id = primary_case.id,
      closed_at = now(), last_status_updated_at = now(), version = version + 1 where id = item.id;
    event := 'MERGED_DUPLICATE';
  else raise exception 'invalid action' using errcode = '22023'; end if;
  insert into public.case_events(case_id,event_type,from_status,to_status,actor_user_id,actor_role,note,metadata)
    select c.id,event,item.status,c.status,actor,'ADMIN',nullif(reason,''),
      jsonb_strip_nulls(jsonb_build_object('unit_id',p_unit_id,'primary_case_id',p_primary_id,'version',c.version))
    from public.cases c where c.id = item.id;
  insert into public.audit_logs(actor_user_id,action,target_type,target_id,case_id,metadata)
    values(actor, 'CASE_' || upper(p_action), 'case', item.id, item.id,
      jsonb_strip_nulls(jsonb_build_object('unit_id',p_unit_id,'primary_case_id',p_primary_id)));
  return jsonb_build_object('status','UPDATED');
end $$;
revoke all on function public.admin_nearby_cases(uuid) from public, anon;
revoke all on function public.admin_case_action(text,uuid,integer,uuid,uuid,text) from public, anon;
grant execute on function public.admin_nearby_cases(uuid) to authenticated;
grant execute on function public.admin_case_action(text,uuid,integer,uuid,uuid,text) to authenticated;
-- TF-53: expose incident type only after existing tracking verification.
create or replace function public.get_case_tracking(
  p_case_code text,
  p_phone_last4 text default null,
  p_tracking_token text default null,
  p_client_ip text default null
)
returns jsonb
language plpgsql
set search_path = public, extensions
as $$
declare
  c_window constant interval := interval '15 minutes';
  c_fail_limit constant integer := 10;

  v_bucket text;
  v_fails integer;
  v_oldest timestamptz;
  v_case public.cases%rowtype;
  v_unit public.units%rowtype;
begin
  -- จำกัดเฉพาะการเปิดด้วย 4 ตัวท้าย token ยาว 32 ตัวเดาไม่ได้อยู่แล้ว และต้องไม่โดนล็อก
  -- เพราะคนในศูนย์อพยพเดียวกันใช้ IP เดียวกัน ญาติที่เปิดลิงก์ต้องยังดูสถานะได้
  if p_tracking_token is null and p_client_ip is not null and btrim(p_client_ip) <> '' then
    v_bucket := 'track:' || encode(digest(btrim(p_client_ip), 'sha256'), 'hex');

    delete from public.sos_rate_limit_hits h
    where h.bucket = v_bucket and h.created_at < now() - c_window;

    select count(*), min(h.created_at) into v_fails, v_oldest
    from public.sos_rate_limit_hits h
    where h.bucket = v_bucket and h.created_at >= now() - c_window;

    if v_fails >= c_fail_limit then
      raise exception 'too many failed tracking lookups'
        using errcode = 'SOS29',
              hint = greatest(1, ceil(extract(epoch from (v_oldest + c_window - now()))))::text;
    end if;
  end if;

  select c.* into v_case
  from public.cases c
  where c.case_code = upper(btrim(p_case_code))
    and (
      (p_tracking_token is not null and c.tracking_token = p_tracking_token)
      or (
        p_phone_last4 is not null
        and exists (
          select 1 from public.case_contacts cc
          where cc.phone_last4 = p_phone_last4 and (cc.case_id = c.id or exists (
            select 1 from rls.case_merged_contacts mc where mc.original_case_id = c.id and mc.contact_id = cc.id
          ))
        )
      )
    );

  -- ไม่บอกว่าผิดที่รหัสเคสหรือ 4 ตัวท้าย จะได้เดาทีละช่องไม่ได้
  if not found then
    if v_bucket is not null then
      insert into public.sos_rate_limit_hits (bucket) values (v_bucket);
    end if;
    return null;
  end if;

  if v_case.assigned_unit_id is not null then
    select * into v_unit from public.units u where u.id = v_case.assigned_unit_id;
  end if;

  return jsonb_build_object(
    'caseCode', v_case.case_code,
    'incidentType', v_case.incident_type,
    -- คืน token ให้คนที่ยืนยันด้วย 4 ตัวท้าย จะได้ใช้ token ดึงข้อมูลรอบต่อๆ ไปและแชร์ลิงก์ได้
    'trackingToken', v_case.tracking_token,
    'status', v_case.status,
    'createdAt', v_case.created_at,
    'lastStatusUpdatedAt', v_case.last_status_updated_at,
    'area', jsonb_build_object(
      'province', v_case.province,
      'district', v_case.district,
      'subdistrict', v_case.subdistrict
    ),
    'team', case
      when v_unit.id is not null then
        jsonb_build_object('unitName', v_unit.name, 'contactPhone', v_unit.contact_phone)
      when v_case.assigned_rescuer_id is not null then
        jsonb_build_object('unitName', null, 'contactPhone', null)
    end,
    'timeline', coalesce((
      select jsonb_agg(
        jsonb_build_object('type', e.event_type, 'toStatus', e.to_status, 'at', e.created_at)
        order by e.created_at
      )
      from public.case_events e
      where e.case_id = v_case.id
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.get_case_tracking(text, text, text, text) is
  'ข้อมูลติดตามเคสสำหรับผู้แจ้ง (ยืนยันด้วยรหัสเคส + 4 ตัวท้ายเบอร์ หรือ tracking token) '
  'ไม่มีข้อมูลส่วนตัวของผู้แจ้ง จำกัด IP ละ 10 ครั้งที่ผิดใน 15 นาที (เรียกได้เฉพาะ service_role)';

revoke all on function public.get_case_tracking(text, text, text, text) from public, anon, authenticated;
grant execute on function public.get_case_tracking(text, text, text, text) to service_role;
