-- ============================================================================
-- TF-59: ส่งต่อเคสให้หน่วยอื่น (กรณีหน่วยเดิมไม่มีเครื่องมือ)
--   1. units.location (แอดมินตั้งได้) + rls.unit_point(): ไม่มีพิกัดใช้จุดกลางอำเภอ ไม่มีอำเภอใช้จังหวัด (โดยประมาณ)
--   2. cases.required_capabilities: แท็กความสามารถที่ต้องใช้ ตอนคำขอหมดเวลาแล้วเคสกลับเข้าคิว
--   3. case_transfers: คำขอส่งต่อ pending/accepted/expired/cancelled — pending ได้ทีละ 1 ต่อเคส
--      เขียนผ่าน RPC เท่านั้น: request_transfer / accept_transfer / cancel_transfer (security definer + rls.can_see_case)
--   4. ระหว่างรอ หน่วยเดิมยังเป็น assigned_unit_id และอัปเดตเคสได้ตามปกติ — หน่วยปลายทางเห็นเคส (ไม่เห็นข้อมูลติดต่อ)
--      กดรับแล้วค่อยย้ายเคส (version กันกดพร้อมกันแบบ TF-25) → 1 เคสมีหน่วยรับผิดชอบหน่วยเดียวตลอด
--   5. เคสเปลี่ยนไปก่อน (ช่วยเสร็จ/ปล่อย/ปิด/ย้ายหน่วย) → คำขอถูกยกเลิกอัตโนมัติ
--   6. pg_cron ทุกนาที: ครบ 15 นาที → expired, เคสกลับเป็น NEW พร้อมแท็ก, แจ้งหัวหน้าหน่วยเดิมทาง LINE
--      เคสแดงแจ้งเตือนซ้ำไปยังหน่วยที่มีความสามารถตามแท็ก (เรียงตามระยะทาง ไม่จำกัดจังหวัด)
--   7. TF-57: นับเคสที่ส่งต่อออกไปเป็น "ส่งต่อ" ให้หน่วยเดิม · ผลงานช่วยสำเร็จนับให้หน่วยที่ปิดเคสตามเดิม
--   8. หน้าติดตามของผู้แจ้ง: transferPending (ไม่บอกชื่อหน่วยปลายทางจนกว่าจะรับ)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. พิกัดหน่วย
-- ----------------------------------------------------------------------------
alter table public.units add column location extensions.geography(Point, 4326);
-- อ่านง่ายสำหรับหน้าแอดมิน (ไม่ต้องแปลง WKB ฝั่งเว็บ)
alter table public.units
  add column location_lat double precision
    generated always as (extensions.st_y(location::extensions.geometry)) stored,
  add column location_lng double precision
    generated always as (extensions.st_x(location::extensions.geometry)) stored;
comment on column public.units.location is
  'TF-59 พิกัดที่ตั้งหน่วย (แอดมินตั้ง) ใช้เรียงหน่วยที่แนะนำตอนส่งต่อ — ว่าง = ใช้จุดกลางอำเภอ/จังหวัดโดยประมาณ';

-- จุดอ้างอิงของหน่วย: พิกัดจริง → จุดกลางอำเภอ → จุดกลางจังหวัด (is_approximate = ไม่ได้ใช้พิกัดจริง)
create function rls.unit_point(p_unit_id uuid)
returns table (point extensions.geography, is_approximate boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
      un.location,
      (select extensions.st_centroid(d.geom)::extensions.geography
       from public.districts d join public.provinces p on p.code = d.province_code
       where p.name_th = un.province and d.name_th = un.district limit 1),
      (select extensions.st_centroid(p.geom)::extensions.geography
       from public.provinces p where p.name_th = un.province limit 1)
    ),
    un.location is null
  from public.units un
  where un.id = p_unit_id
$$;
revoke all on function rls.unit_point(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. แท็กความสามารถที่ต้องใช้ (ตั้งตอนคำขอหมดเวลา ล้างเมื่อมีคนรับเคส)
-- ----------------------------------------------------------------------------
alter table public.cases
  add column required_capabilities text[] not null default '{}'
    check (required_capabilities <@ array['BOAT','EMS','FIRE_SUPPRESSION','EXTRICATION','WATER_RESCUE','ANIMAL_CAPTURE','EVACUATION']);
comment on column public.cases.required_capabilities is
  'TF-59 ความสามารถที่เคสต้องใช้ (จากคำขอส่งต่อที่หมดเวลา) — แสดงในคิวและใช้คัดหน่วยแจ้งเตือนเคสแดงซ้ำ';

-- ----------------------------------------------------------------------------
-- 3. คำขอส่งต่อ
-- ----------------------------------------------------------------------------
create table public.case_transfers (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete restrict,
  from_unit_id uuid not null references public.units(id) on delete restrict,
  to_unit_id uuid not null references public.units(id) on delete restrict,
  requested_by uuid references public.users(id) on delete set null,
  missing_capabilities text[] not null
    check (cardinality(missing_capabilities) between 1 and 7
      and missing_capabilities <@ array['BOAT','EMS','FIRE_SUPPRESSION','EXTRICATION','WATER_RESCUE','ANIMAL_CAPTURE','EVACUATION']),
  -- ความยาวตรงกับ caseTransferReasonSchema ใน src/lib/domain
  reason text not null check (char_length(btrim(reason)) between 5 and 300),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'cancelled')),
  expires_at timestamptz not null default now() + interval '15 minutes',
  decided_by uuid references public.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (from_unit_id <> to_unit_id),
  check ((status = 'pending') = (decided_at is null))
);
comment on table public.case_transfers is
  'TF-59 คำขอส่งต่อเคสให้หน่วยที่มีความสามารถ — เขียนผ่าน request_transfer/accept_transfer/cancel_transfer เท่านั้น';
-- ส่งต่อซ้อนกันไม่ได้: pending ได้ทีละ 1 คำขอต่อเคส
create unique index case_transfers_one_pending on public.case_transfers (case_id) where status = 'pending';
create index idx_case_transfers_to_unit_pending on public.case_transfers (to_unit_id) where status = 'pending';
create index idx_case_transfers_expiry on public.case_transfers (expires_at) where status = 'pending';
create index idx_case_transfers_case on public.case_transfers (case_id, created_at);

alter table public.case_transfers enable row level security;
revoke all on public.case_transfers from public, anon, authenticated;
grant select on public.case_transfers to authenticated;
create policy "read transfers of visible cases" on public.case_transfers
  for select to authenticated
  using (rls.can_see_case(case_id));

-- หน่วยปลายทางของคำขอที่ยังรออยู่ (ใช้ขยายสิทธิ์มองเห็นเคส)
create function rls.is_pending_transfer_target(p_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.case_transfers t
    where t.case_id = p_case_id and t.status = 'pending'
      and t.to_unit_id in (select rls.my_unit_ids())
  )
$$;
revoke all on function rls.is_pending_transfer_target(uuid) from public, anon;
grant execute on function rls.is_pending_transfer_target(uuid) to authenticated;

-- ชุด id เคสที่รอหน่วยของฉันรับ — ใช้ใน policy ของ cases (คำนวณครั้งเดียวต่อคำสั่ง ไม่เรียกฟังก์ชันทีละแถว)
create function rls.my_pending_transfer_case_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.case_id from public.case_transfers t
  where t.status = 'pending' and t.to_unit_id in (select rls.my_unit_ids())
$$;
revoke all on function rls.my_pending_transfer_case_ids() from public, anon;
grant execute on function rls.my_pending_transfer_case_ids() to authenticated;

-- ส่งต่อได้: คนที่รับเคส หรือหัวหน้าของหน่วยที่รับ ตอน ACCEPTED/EN_ROUTE/ON_SITE (แอดมินไม่รับเคสเอง จึงไม่ส่งต่อ)
create function rls.can_request_transfer(p_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not rls.is_admin() and exists (
    select 1 from public.cases c
    where c.id = p_case_id and not c.is_demo
      and c.status in ('ACCEPTED', 'EN_ROUTE', 'ON_SITE')
      and c.assigned_unit_id is not null
      and (
        (c.assigned_rescuer_id = rls.current_user_id() and c.assigned_unit_id in (select rls.my_unit_ids()))
        or c.assigned_unit_id in (select rls.my_unit_ids(true))
      )
  )
$$;
revoke all on function rls.can_request_transfer(uuid) from public, anon, authenticated;

-- หน่วยปลายทางที่รับส่งต่อได้: มีความสามารถครบ, เปิดใช้งาน, ไม่ใช่หน่วยตัวอย่าง (TF-70)
-- และมีสมาชิกที่กดรับได้จริงอย่างน้อย 1 คน (ไม่งั้นรอ 15 นาทีเปล่าๆ)
create function rls.can_receive_transfer(p_unit_id uuid, p_capabilities text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.units un
    where un.id = p_unit_id and un.is_active and un.source <> 'DEMO'
      and (select coalesce(array_agg(uc.capability), '{}') from public.unit_capabilities uc
           where uc.unit_id = un.id) @> p_capabilities
      and exists (
        select 1 from public.unit_members m
        join public.users u on u.id = m.user_id and u.status = 'ACTIVE' and u.role in ('RESCUER', 'UNIT_LEAD')
        where m.unit_id = un.id and m.status = 'APPROVED' and (m.expires_at is null or m.expires_at > now())
      )
  )
$$;
revoke all on function rls.can_receive_transfer(uuid, text[]) from public, anon, authenticated;

create function rls.valid_capabilities(p_capabilities text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_capabilities is not null
    and cardinality(p_capabilities) between 1 and 7
    and array_position(p_capabilities, null) is null
    and p_capabilities <@ array['BOAT','EMS','FIRE_SUPPRESSION','EXTRICATION','WATER_RESCUE','ANIMAL_CAPTURE','EVACUATION']
$$;

-- ----------------------------------------------------------------------------
-- 4. หน่วยปลายทางเห็นเคสที่รอรับส่งต่อ (ไม่เห็นชื่อ/เบอร์/ข้อมูลสุขภาพจนกว่าจะรับ)
-- ----------------------------------------------------------------------------
create or replace function rls.can_see_case(p_case_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select rls.is_admin() or exists (
    select 1 from public.cases c
    where c.id = p_case_id
      and not c.is_demo -- TF-70: เคสตัวอย่างเห็นได้เฉพาะแอดมิน
      and (
        c.reporter_user_id = rls.current_user_id()
        or (
          c.assigned_rescuer_id = rls.current_user_id()
          and exists (select 1 from rls.my_unit_ids())
        )
        or c.assigned_unit_id in (select rls.my_unit_ids())
        or c.province in (select rls.my_provinces())
        -- TF-59: หน่วยปลายทางของคำขอส่งต่อที่ยังรออยู่ (ข้อมูลติดต่อ/สุขภาพ/รูปยังใช้ฟังก์ชันที่เข้มกว่า)
        or rls.is_pending_transfer_target(c.id)
      )
  )
$function$;

drop policy if exists "read visible cases" on public.cases;
create policy "read visible cases" on public.cases
  for select to authenticated
  using (
    (select rls.is_admin())
    or (
      not is_demo -- TF-70: เคสตัวอย่างเห็นได้เฉพาะแอดมิน
      and (
        reporter_user_id = (select rls.current_user_id())
        or (
          assigned_rescuer_id = (select rls.current_user_id())
          and exists (select 1 from rls.my_unit_ids())
        )
        or assigned_unit_id in (select rls.my_unit_ids())
        or province in (select rls.my_provinces())
        or id in (select rls.my_pending_transfer_case_ids()) -- TF-59
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 5. ตัวกันการเปลี่ยนสถานะ: ช่องทางส่งต่อ (app.case_transfer ตั้งเฉพาะใน RPC ของ TF-59)
-- ----------------------------------------------------------------------------
create or replace function public.guard_case_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  -- TF-59: ส่งต่อ (accept_transfer → ACCEPTED ของหน่วยใหม่) / คำขอหมดเวลา (→ NEW) ทำได้จากสถานะที่ทีมถืออยู่
  if coalesce(current_setting('app.case_transfer', true), '') = 'on'
    and old.status in ('ACCEPTED', 'EN_ROUTE', 'ON_SITE') and new.status in ('ACCEPTED', 'NEW') then
    return new;
  end if;
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
end $function$;

-- ----------------------------------------------------------------------------
-- 6. หน่วยที่แนะนำ: ความสามารถครบ เรียงตามระยะทางจากพิกัดหน่วยถึงเคส (ไม่ใช้ตำแหน่งกู้ภัย)
-- ----------------------------------------------------------------------------
create function public.case_transfer_options(p_case_id uuid, p_capabilities text[])
returns table (
  unit_id uuid, unit_name text, province text, district text,
  distance_m integer, is_approximate boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if rls.current_user_id() is null or not rls.can_see_case(p_case_id)
    or not rls.can_request_transfer(p_case_id) then
    raise exception 'not allowed to transfer this case' using errcode = '42501';
  end if;
  if not rls.valid_capabilities(p_capabilities) then
    raise exception 'invalid capabilities' using errcode = '22023';
  end if;
  return query
    select un.id, un.name, un.province, un.district,
      round(extensions.st_distance(pt.point, c.location))::integer,
      pt.is_approximate
    from public.cases c
    join public.units un on un.id <> c.assigned_unit_id
    cross join lateral rls.unit_point(un.id) pt
    where c.id = p_case_id and rls.can_receive_transfer(un.id, p_capabilities)
    order by extensions.st_distance(pt.point, c.location) nulls last, un.name, un.id
    limit 20;
end;
$$;
revoke all on function public.case_transfer_options(uuid, text[]) from public, anon;
grant execute on function public.case_transfer_options(uuid, text[]) to authenticated;

-- ----------------------------------------------------------------------------
-- 7. ขอส่งต่อ — เคสยังเป็นของหน่วยเดิม (ไม่เปลี่ยน version: หน่วยเดิมอัปเดตต่อได้ทันที)
-- ----------------------------------------------------------------------------
create function public.request_transfer(
  p_case_id uuid,
  p_expected_version integer,
  p_to_unit_id uuid,
  p_capabilities text[],
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := rls.current_user_id();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_caps text[];
  v_case public.cases%rowtype;
  v_transfer public.case_transfers%rowtype;
begin
  if v_actor is null or not rls.can_see_case(p_case_id) then
    raise exception 'case not found' using errcode = '42501';
  end if;
  if exists (select 1 from public.cases d where d.id = p_case_id and d.is_demo) then
    raise exception 'demo case' using errcode = '22023';
  end if;
  if not rls.valid_capabilities(p_capabilities) then
    raise exception 'invalid capabilities' using errcode = '22023';
  end if;
  if char_length(v_reason) not between 5 and 300 then
    raise exception 'transfer reason must be 5-300 characters' using errcode = '22023';
  end if;
  select array_agg(distinct x order by x) into v_caps from unnest(p_capabilities) x;

  -- ล็อกเคสก่อนตรวจ กันขอส่งต่อพร้อมกัน 2 คำขอ
  select * into v_case from public.cases c where c.id = p_case_id for update;
  if not rls.can_request_transfer(p_case_id) then
    raise exception 'not allowed to transfer this case' using errcode = '42501';
  end if;
  if v_case.version <> p_expected_version then
    return jsonb_build_object('status', 'STALE', 'version', v_case.version);
  end if;
  if exists (select 1 from public.case_transfers t where t.case_id = p_case_id and t.status = 'pending') then
    return jsonb_build_object('status', 'ALREADY_PENDING');
  end if;
  if p_to_unit_id is null or p_to_unit_id = v_case.assigned_unit_id
    or not rls.can_receive_transfer(p_to_unit_id, v_caps) then
    raise exception 'unit cannot receive this transfer' using errcode = '22023';
  end if;

  insert into public.case_transfers (case_id, from_unit_id, to_unit_id, requested_by, missing_capabilities, reason)
  values (p_case_id, v_case.assigned_unit_id, p_to_unit_id, v_actor, v_caps, v_reason)
  returning * into v_transfer;

  insert into public.case_events (
    case_id, event_type, from_status, to_status, actor_user_id, actor_unit_id, actor_role, note, metadata
  )
  values (
    p_case_id, 'TRANSFER_REQUESTED', v_case.status, v_case.status, v_actor, v_case.assigned_unit_id,
    case when v_case.assigned_rescuer_id = v_actor then 'RESCUER' else 'UNIT_LEAD' end,
    v_reason,
    jsonb_build_object('transferId', v_transfer.id, 'toUnitId', p_to_unit_id, 'missingCapabilities', v_caps)
  );
  insert into public.audit_logs (actor_user_id, action, target_type, target_id, case_id, metadata)
  values (
    v_actor, 'CASE_TRANSFER_REQUESTED', 'case', p_case_id, p_case_id,
    jsonb_build_object('transfer_id', v_transfer.id, 'from_unit_id', v_case.assigned_unit_id,
      'to_unit_id', p_to_unit_id, 'missing_capabilities', v_caps)
  );

  return jsonb_build_object('status', 'REQUESTED', 'transferId', v_transfer.id, 'expiresAt', v_transfer.expires_at);
end;
$$;
revoke all on function public.request_transfer(uuid, integer, uuid, text[], text) from public, anon;
grant execute on function public.request_transfer(uuid, integer, uuid, text[], text) to authenticated;

-- ----------------------------------------------------------------------------
-- 8. หน่วยปลายทางกดรับ — ย้ายเคสในคำสั่งเดียว (version กันกดพร้อมกัน + เพดาน 2 เคสแบบ TF-25)
-- ----------------------------------------------------------------------------
create function public.accept_transfer(p_transfer_id uuid, p_expected_version integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_max_active constant integer := 2;
  v_actor uuid := rls.current_user_id();
  v_transfer public.case_transfers%rowtype;
  v_before public.cases%rowtype;
  v_case public.cases%rowtype;
  v_active integer;
  v_moved boolean;
begin
  select * into v_transfer from public.case_transfers t where t.id = p_transfer_id;
  if v_actor is null or not found or not rls.can_see_case(v_transfer.case_id)
    or v_transfer.to_unit_id not in (select rls.my_unit_ids()) then
    raise exception 'transfer not found' using errcode = '42501';
  end if;
  if rls.is_admin() then
    raise exception 'admins assign cases instead of accepting' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('tf25-rescuer:' || v_actor::text, 0));
  select count(*) into v_active
  from public.cases c
  where c.assigned_rescuer_id = v_actor and c.status in ('ACCEPTED', 'EN_ROUTE', 'ON_SITE');
  if v_active >= c_max_active then
    return jsonb_build_object('status', 'LIMIT', 'max', c_max_active);
  end if;

  -- ล็อกคำขอ: กดรับพร้อมกัน/หมดเวลาพร้อมกัน ได้ผลเดียว
  select * into v_transfer from public.case_transfers t where t.id = p_transfer_id for update;
  if v_transfer.status <> 'pending' or v_transfer.expires_at <= now() then
    return jsonb_build_object('status', 'NOT_PENDING', 'transferStatus', v_transfer.status);
  end if;

  select * into v_before from public.cases c where c.id = v_transfer.case_id;
  perform set_config('app.case_transfer', 'on', true);
  update public.cases c
  set status = 'ACCEPTED',
      assigned_unit_id = v_transfer.to_unit_id,
      assigned_rescuer_id = v_actor,
      accepted_at = now(),
      required_capabilities = '{}',
      last_status_updated_at = now(),
      version = c.version + 1
  where c.id = v_transfer.case_id
    and c.version = p_expected_version
    and c.status in ('ACCEPTED', 'EN_ROUTE', 'ON_SITE')
    and c.assigned_unit_id = v_transfer.from_unit_id
  returning * into v_case;
  v_moved := found; -- เก็บก่อน: perform ข้างล่างเปลี่ยนค่า found
  perform set_config('app.case_transfer', 'off', true);
  if not v_moved then
    return jsonb_build_object('status', 'STALE', 'version', v_before.version);
  end if;

  update public.case_transfers t
  set status = 'accepted', decided_by = v_actor, decided_at = now()
  where t.id = v_transfer.id;

  insert into public.case_events (
    case_id, event_type, from_status, to_status, actor_user_id, actor_unit_id, actor_role, metadata
  )
  values (
    v_case.id, 'TRANSFER_ACCEPTED', v_before.status, 'ACCEPTED', v_actor, v_transfer.to_unit_id, 'RESCUER',
    jsonb_build_object('transferId', v_transfer.id, 'fromUnitId', v_transfer.from_unit_id,
      'previousRescuerId', v_before.assigned_rescuer_id, 'version', v_case.version)
  );
  insert into public.audit_logs (actor_user_id, action, target_type, target_id, case_id, metadata)
  values (
    v_actor, 'CASE_TRANSFER_ACCEPTED', 'case', v_case.id, v_case.id,
    jsonb_build_object('transfer_id', v_transfer.id, 'from_unit_id', v_transfer.from_unit_id,
      'to_unit_id', v_transfer.to_unit_id)
  );

  return jsonb_build_object('status', 'ACCEPTED', 'caseId', v_case.id, 'version', v_case.version);
end;
$$;
revoke all on function public.accept_transfer(uuid, integer) from public, anon;
grant execute on function public.accept_transfer(uuid, integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 9. ยกเลิกคำขอ: คนที่ขอ / หัวหน้าหน่วยเดิม / แอดมิน — เคสอยู่กับหน่วยเดิมเหมือนเดิม
-- ----------------------------------------------------------------------------
create function public.cancel_transfer(p_transfer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := rls.current_user_id();
  v_transfer public.case_transfers%rowtype;
  v_state text;
  v_status public.case_status;
begin
  select * into v_transfer from public.case_transfers t where t.id = p_transfer_id;
  if v_actor is null or not found or not rls.can_see_case(v_transfer.case_id) then
    raise exception 'transfer not found' using errcode = '42501';
  end if;
  if not (
    rls.is_admin()
    or v_transfer.requested_by = v_actor
    or v_transfer.from_unit_id in (select rls.my_unit_ids(true))
  ) then
    raise exception 'not allowed to cancel this transfer' using errcode = '42501';
  end if;

  update public.case_transfers t
  set status = 'cancelled', decided_by = v_actor, decided_at = now()
  where t.id = p_transfer_id and t.status = 'pending'
  returning * into v_transfer;
  if not found then
    select t.status into v_state from public.case_transfers t where t.id = p_transfer_id;
    return jsonb_build_object('status', 'NOT_PENDING', 'transferStatus', v_state);
  end if;

  select c.status into v_status from public.cases c where c.id = v_transfer.case_id;
  insert into public.case_events (
    case_id, event_type, from_status, to_status, actor_user_id, actor_unit_id, actor_role, metadata
  )
  values (
    v_transfer.case_id, 'TRANSFER_CANCELLED', v_status, v_status, v_actor, v_transfer.from_unit_id,
    case when rls.is_admin() then 'ADMIN' when v_transfer.requested_by = v_actor then 'RESCUER' else 'UNIT_LEAD' end,
    jsonb_build_object('transferId', v_transfer.id, 'toUnitId', v_transfer.to_unit_id)
  );
  insert into public.audit_logs (actor_user_id, action, target_type, target_id, case_id, metadata)
  values (
    v_actor, 'CASE_TRANSFER_CANCELLED', 'case', v_transfer.case_id, v_transfer.case_id,
    jsonb_build_object('transfer_id', v_transfer.id)
  );
  return jsonb_build_object('status', 'CANCELLED');
end;
$$;
revoke all on function public.cancel_transfer(uuid) from public, anon;
grant execute on function public.cancel_transfer(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 10. เคสเปลี่ยนไปก่อนมีคนรับ (ช่วยเสร็จ/ปล่อย/ปิด/ย้ายหน่วย) → ยกเลิกคำขอที่รออยู่อัตโนมัติ
--     ไม่ทำงานตอน accept_transfer / หมดเวลา (app.case_transfer = on) ซึ่งจัดการคำขอเอง
-- ----------------------------------------------------------------------------
create function rls.cancel_stale_transfer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transfer public.case_transfers%rowtype;
begin
  if coalesce(current_setting('app.case_transfer', true), '') = 'on' then
    return new;
  end if;
  update public.case_transfers t
  set status = 'cancelled', decided_at = now()
  where t.case_id = new.id and t.status = 'pending'
    and (new.status not in ('ACCEPTED', 'EN_ROUTE', 'ON_SITE') or new.assigned_unit_id is distinct from t.from_unit_id)
  returning * into v_transfer;
  if found then
    insert into public.case_events (case_id, event_type, from_status, to_status, actor_unit_id, actor_role, metadata)
    values (new.id, 'TRANSFER_CANCELLED', old.status, new.status, v_transfer.from_unit_id, 'SYSTEM',
      jsonb_build_object('transferId', v_transfer.id, 'toUnitId', v_transfer.to_unit_id, 'reason', 'CASE_CHANGED'));
  end if;
  return new;
end;
$$;
create trigger trg_case_cancel_stale_transfer
  after update of status, assigned_unit_id on public.cases
  for each row
  when (old.status is distinct from new.status or old.assigned_unit_id is distinct from new.assigned_unit_id)
  execute function rls.cancel_stale_transfer();

-- ----------------------------------------------------------------------------
-- 11. หมดเวลา 15 นาที: เคสกลับเป็น NEW + แท็ก, แจ้งหัวหน้าหน่วยเดิม, เคสแดงแจ้งเตือนซ้ำ
-- ----------------------------------------------------------------------------
alter table public.case_line_notifications drop constraint case_line_notifications_kind_check;
alter table public.case_line_notifications add constraint case_line_notifications_kind_check
  check (kind in ('CASE_STATUS', 'RED_ALERT', 'CLOSE_CONFIRM', 'TRANSFER_EXPIRED'));

create function rls.expire_case_transfers()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transfer public.case_transfers%rowtype;
  v_before public.cases%rowtype;
  v_case public.cases%rowtype;
  v_count integer := 0;
  v_moved boolean;
begin
  for v_transfer in
    select t.* from public.case_transfers t
    where t.status = 'pending' and t.expires_at <= now()
    order by t.expires_at
    for update skip locked
  loop
    select * into v_before from public.cases c where c.id = v_transfer.case_id for update;
    update public.case_transfers t set status = 'expired', decided_at = now() where t.id = v_transfer.id;

    -- เคสยังอยู่กับหน่วยเดิม (ถ้าไม่ใช่ trigger ข้อ 10 ยกเลิกไปแล้ว) → กลับเข้าคิวพร้อมแท็ก
    perform set_config('app.case_transfer', 'on', true);
    update public.cases c
    set status = 'NEW',
        assigned_unit_id = null,
        assigned_rescuer_id = null,
        accepted_at = null,
        required_capabilities = v_transfer.missing_capabilities,
        last_status_updated_at = now(),
        version = c.version + 1
    where c.id = v_transfer.case_id
      and c.status in ('ACCEPTED', 'EN_ROUTE', 'ON_SITE')
      and c.assigned_unit_id = v_transfer.from_unit_id
    returning * into v_case;
    v_moved := found; -- เก็บก่อน: perform ข้างล่างเปลี่ยนค่า found
    perform set_config('app.case_transfer', 'off', true);
    continue when not v_moved;
    v_count := v_count + 1;

    insert into public.case_events (case_id, event_type, from_status, to_status, actor_unit_id, actor_role, metadata)
    values (v_case.id, 'TRANSFER_EXPIRED', v_before.status, 'NEW', v_transfer.from_unit_id, 'SYSTEM',
      jsonb_build_object('transferId', v_transfer.id, 'toUnitId', v_transfer.to_unit_id,
        'requiredCapabilities', v_transfer.missing_capabilities,
        'releasedRescuerId', v_before.assigned_rescuer_id, 'version', v_case.version));
    insert into public.audit_logs (action, target_type, target_id, case_id, metadata)
    values ('CASE_TRANSFER_EXPIRED', 'case', v_case.id, v_case.id,
      jsonb_build_object('transfer_id', v_transfer.id, 'from_unit_id', v_transfer.from_unit_id,
        'to_unit_id', v_transfer.to_unit_id));

    -- แจ้งหัวหน้าหน่วยเดิมทาง LINE (คิวพลาด การคืนเคสยังสำเร็จ)
    begin
      insert into public.case_line_notifications (case_id, user_id, kind)
      select v_case.id, u.id, 'TRANSFER_EXPIRED'
      from public.units un join public.users u on u.id = un.lead_user_id
      where un.id = v_transfer.from_unit_id and u.status = 'ACTIVE' and u.line_user_id ~ '^U[0-9a-fA-F]{32}$';
    exception when others then
      raise warning 'transfer expiry lead notification failed: %', sqlerrm;
    end;

    -- เคสแดง: แจ้งเตือนซ้ำแบบ release_case (TF-25) แต่คัดหน่วยตามแท็ก (list_red_alert_candidates)
    if v_case.urgency = 'RED' then
      begin
        insert into public.line_red_case_queue as q (case_id, alert_round, exclude_user_id)
        values (v_case.id, 1, v_before.assigned_rescuer_id)
        on conflict (case_id) do update
          set processed_at = null,
              created_at = now(),
              alert_round = q.alert_round + 1,
              exclude_user_id = excluded.exclude_user_id;
      exception when others then
        raise warning 'red case re-alert enqueue failed: %', sqlerrm;
      end;
    end if;
  end loop;
  return v_count;
end;
$$;
revoke all on function rls.expire_case_transfers() from public, anon, authenticated;

select cron.schedule('tf59-expire-case-transfers', '* * * * *', 'select rls.expire_case_transfers()');

-- มีคนรับเคส NEW ที่ติดแท็กไปแล้ว: ล้างแท็ก (ช่องทางรับเคสเดิมทุกช่องผ่าน trigger นี้)
create function rls.clear_required_capabilities()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'NEW' and new.status <> 'NEW' then
    new.required_capabilities := '{}';
  end if;
  return new;
end;
$$;
create trigger trg_case_clear_required_capabilities
  before update of status on public.cases
  for each row execute function rls.clear_required_capabilities();

-- ----------------------------------------------------------------------------
-- 12. ผู้รับแจ้งเตือนเคสแดง: เคสที่ติดแท็กความสามารถ → หน่วยที่มีครบ เรียงตามระยะทาง
-- ----------------------------------------------------------------------------
create or replace function public.list_red_alert_candidates(p_case_id uuid)
 RETURNS TABLE(unit_id uuid, capabilities text[], user_id uuid)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select un.id,
    coalesce((select array_agg(uc.capability order by uc.capability)
              from public.unit_capabilities uc where uc.unit_id = un.id), '{}'),
    u.id
  from public.cases c
  join public.unit_members m on m.status = 'APPROVED'
    and (m.expires_at is null or m.expires_at > now())
    and m.is_on_duty and m.duty_status <> 'OFFLINE'
  join public.units un on un.id = m.unit_id and un.is_active
  join public.users u on u.id = m.user_id and u.status = 'ACTIVE'
    and u.line_user_id ~ '^U[0-9a-fA-F]{32}$'
  left join public.rescuer_locations r on r.user_id = u.id and r.is_sharing
    and r.recorded_at > now() - interval '15 minutes'
  left join public.line_red_case_queue q on q.case_id = c.id
  where c.id = p_case_id and u.id is distinct from c.reporter_user_id
    and u.id is distinct from q.exclude_user_id
    and case
      -- TF-59: เคสที่ส่งต่อไม่สำเร็จ → หน่วยที่มีความสามารถตามแท็กครบ (ไม่ใช่หน่วยตัวอย่าง) ทุกพื้นที่
      when cardinality(c.required_capabilities) > 0 then un.source <> 'DEMO'
        and (select coalesce(array_agg(uc.capability), '{}') from public.unit_capabilities uc
             where uc.unit_id = un.id) @> c.required_capabilities
      when r.user_id is not null then extensions.st_dwithin(r.location, c.location, 5000)
      else un.province = c.province
        and (un.district is null or c.district is null or un.district = c.district)
    end
  order by
    case when cardinality(c.required_capabilities) > 0 then
      (select extensions.st_distance(pt.point, c.location) from rls.unit_point(un.id) pt)
    end nulls last,
    un.created_at, un.id, m.approved_at nulls last, u.id
$function$;

-- worker ต้องรู้แท็กด้วย: หน่วยที่ผ่านแท็กไม่ต้องผ่าน canUnitHandle ตามประเภทเหตุอีก
drop function public.claim_red_case_fanouts();
create function public.claim_red_case_fanouts()
returns table (case_id uuid, incident_type text, required_capabilities text[])
language plpgsql
set search_path = ''
as $$
begin
  update public.line_red_case_queue q set processed_at = now()
    from public.cases c
    where c.id = q.case_id and q.processed_at is null and c.status <> 'NEW';
  return query
    select q.case_id, c.incident_type, c.required_capabilities
    from public.line_red_case_queue q join public.cases c on c.id = q.case_id
    where q.processed_at is null
    order by q.created_at
    limit 10
    for update of q skip locked;
end;
$$;
revoke all on function public.claim_red_case_fanouts() from public, anon, authenticated;
grant execute on function public.claim_red_case_fanouts() to service_role;

-- ----------------------------------------------------------------------------
-- 13. คิว LINE รายเคส: คืน case_id ด้วย (ข้อความถึงหัวหน้าลิงก์ไปหน้าเคสของกู้ภัย)
-- ----------------------------------------------------------------------------
drop function public.claim_case_line_notifications();
create function public.claim_case_line_notifications()
 RETURNS TABLE(id uuid, case_id uuid, lease_id uuid, line_user_id text, case_code text, tracking_token text, kind text, to_status case_status, incident_type text, district text, province text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  ) select n.id, n.case_id, n.lease_id, u.line_user_id, c.case_code, c.tracking_token, n.kind, n.to_status,
      c.incident_type, c.district, c.province, n.created_at
    from leased n join public.users u on u.id = n.user_id join public.cases c on c.id = n.case_id
    order by n.seq;
end;
$function$;
revoke all on function public.claim_case_line_notifications() from public, anon, authenticated;
grant execute on function public.claim_case_line_notifications() to service_role;

-- ----------------------------------------------------------------------------
-- 14. หน้ารายละเอียดเคส: ปุ่มส่งต่อ/รับ/ยกเลิก + คำขอที่รออยู่
-- ----------------------------------------------------------------------------
create or replace function public.case_detail_permissions(p_case_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := rls.current_user_id();
  item public.cases%rowtype;
  is_admin boolean := rls.is_admin();
  has_unit boolean := exists (select 1 from rls.my_unit_ids());
  pending public.case_transfers%rowtype;
begin
  if actor is null or (not is_admin and not has_unit) or not rls.can_see_case(p_case_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into item from public.cases where id = p_case_id;
  if not found then raise exception 'not authorized' using errcode = '42501'; end if;
  select * into pending from public.case_transfers t where t.case_id = p_case_id and t.status = 'pending';
  return jsonb_build_object(
    'contact', is_admin or (has_unit and item.assigned_rescuer_id = actor),
    'override', (is_admin or item.assigned_rescuer_id = actor or item.assigned_unit_id in (select rls.my_unit_ids(true)))
      and item.status in ('NEW', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE'),
    'accept', not is_admin and item.status = 'NEW' and public.claim_unit_for_case(p_case_id) is not null,
    'release', item.status in ('ACCEPTED', 'EN_ROUTE')
      and (is_admin or item.assigned_rescuer_id = actor or item.assigned_unit_id in (select rls.my_unit_ids(true))),
    -- TF-59
    'transfer', pending.id is null and rls.can_request_transfer(p_case_id),
    'acceptTransfer', pending.id is not null and not is_admin
      and pending.to_unit_id in (select rls.my_unit_ids()),
    'cancelTransfer', pending.id is not null
      and (is_admin or pending.requested_by = actor or pending.from_unit_id in (select rls.my_unit_ids(true))),
    'pendingTransfer', case when pending.id is null then null else jsonb_build_object(
      'id', pending.id,
      'fromUnitName', (select un.name from public.units un where un.id = pending.from_unit_id),
      'toUnitName', (select un.name from public.units un where un.id = pending.to_unit_id),
      'missingCapabilities', pending.missing_capabilities,
      'reason', pending.reason,
      'expiresAt', pending.expires_at
    ) end,
    'requiredCapabilities', item.required_capabilities
  );
end $function$;

-- ----------------------------------------------------------------------------
-- 15. คิว "รอรับส่งต่อ" ของหน่วยปลายทาง (ไม่มีชื่อ/เบอร์ผู้แจ้ง)
-- ----------------------------------------------------------------------------
create function public.list_incoming_transfers()
returns table (
  transfer_id uuid, case_id uuid, case_code text, case_version integer, case_status public.case_status,
  incident_type text, urgency public.urgency_level, province text, district text, landmark text,
  from_unit_name text, to_unit_name text, missing_capabilities text[], reason text,
  expires_at timestamptz, created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, c.id, c.case_code, c.version, c.status, c.incident_type, c.urgency,
    c.province, c.district, c.landmark,
    fu.name, tu.name, t.missing_capabilities, t.reason, t.expires_at, t.created_at
  from public.case_transfers t
  join public.cases c on c.id = t.case_id and not c.is_demo
  join public.units fu on fu.id = t.from_unit_id
  join public.units tu on tu.id = t.to_unit_id
  where t.status = 'pending' and t.expires_at > now()
    and t.to_unit_id in (select rls.my_unit_ids())
  order by t.expires_at, t.id
$$;
revoke all on function public.list_incoming_transfers() from public, anon;
grant execute on function public.list_incoming_transfers() to authenticated;

-- ----------------------------------------------------------------------------
-- 16. รายการ/แผนที่ของกู้ภัย: คืนแท็กความสามารถที่ต้องใช้
-- ----------------------------------------------------------------------------
drop function public.list_rescue_cases(double precision, double precision, integer, text, numeric, numeric, numeric, uuid, integer);
create function public.list_rescue_cases(p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_radius_m integer DEFAULT NULL::integer, p_sort text DEFAULT 'PRIORITY'::text, p_after_k1 numeric DEFAULT NULL::numeric, p_after_k2 numeric DEFAULT NULL::numeric, p_after_k3 numeric DEFAULT NULL::numeric, p_after_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100)
 RETURNS TABLE(id uuid, case_code text, status case_status, incident_type text, urgency urgency_level, triage_reasons text[], system_urgency urgency_level, urgency_override_reason text, priority_score integer, created_at timestamp with time zone, lat double precision, lng double precision, accuracy_m double precision, location_source text, province text, district text, subdistrict text, landmark text, adults integer, elderly integer, bedridden integer, children integer, pets integer, required_capabilities text[], distance_m double precision, sort_k1 text, sort_k2 text, sort_k3 text, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
#variable_conflict use_column
declare
  v_point geography;
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 100);
begin
  -- หน้านี้สำหรับกู้ภัย/หัวหน้าหน่วย/แอดมินเท่านั้น (ผู้ใช้ทั่วไปมีหน้าเคสของฉันแยก)
  if not (rls.is_admin() or exists (select 1 from rls.my_unit_ids())) then
    raise exception 'rescue case list requires an active unit membership' using errcode = '42501';
  end if;
  if p_sort is null or p_sort not in ('PRIORITY', 'DISTANCE', 'WAITING') then
    raise exception 'invalid sort %', p_sort using errcode = '22023';
  end if;
  if (p_lat is null) <> (p_lng is null) then
    raise exception 'lat and lng must be given together' using errcode = '22023';
  end if;
  if p_radius_m is not null and p_radius_m not in (5000, 10000, 20000) then
    raise exception 'radius must be 5, 10 or 20 km' using errcode = '22023';
  end if;
  if p_radius_m is not null and p_lat is null then
    raise exception 'radius filter needs the caller location' using errcode = '22023';
  end if;
  if p_sort = 'DISTANCE' and p_lat is null then
    raise exception 'distance sort needs the caller location' using errcode = '22023';
  end if;
  if p_after_id is not null and (p_after_k1 is null or p_after_k2 is null or p_after_k3 is null) then
    raise exception 'cursor must include all sort keys' using errcode = '22023';
  end if;

  if p_lat is not null then
    v_point := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;
  end if;

  return query
  with visible as (
    select
      c.*,
      case when v_point is null then null else ST_Distance(c.location, v_point) end as dist,
      case c.urgency when 'RED' then 3 when 'YELLOW' then 2 else 1 end as urgency_rank,
      extract(epoch from c.created_at)::numeric as created_epoch
    from public.cases c
    where c.status in ('NEW', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE')
      and not c.is_demo -- TF-70: เคสตัวอย่างไม่ขึ้นรายการ/แผนที่ของกู้ภัย (รวมแอดมิน)
      and (p_radius_m is null or ST_DWithin(c.location, v_point, p_radius_m))
      -- ไม่มีพิกัดของผู้เรียก: ใช้จังหวัดของหน่วย + เคสที่ตัวเอง/หน่วยรับอยู่ (แอดมินเห็นทั้งหมด)
      and (
        v_point is not null
        or rls.is_admin()
        or c.province in (select rls.my_provinces())
        or c.assigned_rescuer_id = rls.current_user_id()
        or c.assigned_unit_id in (select rls.my_unit_ids())
      )
  ),
  keyed as (
    select
      v.*,
      case p_sort
        when 'PRIORITY' then -v.urgency_rank::numeric
        when 'DISTANCE' then v.dist::numeric
        else case when v.status = 'NEW' then 0 else 1 end::numeric
      end as k1,
      case p_sort
        when 'PRIORITY' then -v.priority_score::numeric
        when 'DISTANCE' then -v.urgency_rank::numeric
        else v.created_epoch
      end as k2,
      case p_sort
        when 'WAITING' then -v.urgency_rank::numeric
        else v.created_epoch
      end as k3
    from visible v
  ),
  counted as (select count(*) as total from keyed),
  paged as (
    select k.*
    from keyed k
    where p_after_id is null or (k.k1, k.k2, k.k3, k.id) > (p_after_k1, p_after_k2, p_after_k3, p_after_id)
    order by k.k1, k.k2, k.k3, k.id
    limit v_limit
  )
  select
    p.id, p.case_code, p.status, p.incident_type, p.urgency, p.triage_reasons,
    p.system_urgency, p.urgency_override_reason, p.priority_score, p.created_at,
    p.lat, p.lng, p.accuracy_m, p.location_source,
    p.province, p.district, p.subdistrict, p.landmark,
    cp.adults as p_adults, cp.elderly as p_elderly, cp.bedridden as p_bedridden,
    cp.children as p_children, cp.pets as p_pets,
    p.required_capabilities, -- TF-59
    p.dist, p.k1::text, p.k2::text, p.k3::text, counted.total
  from paged p
  cross join counted
  left join public.case_people cp on cp.case_id = p.id
  order by p.k1, p.k2, p.k3, p.id;
end;
$function$;
revoke all on function public.list_rescue_cases(double precision, double precision, integer, text, numeric, numeric, numeric, uuid, integer) from public, anon;
grant execute on function public.list_rescue_cases(double precision, double precision, integer, text, numeric, numeric, numeric, uuid, integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 17. หน้าติดตามของผู้แจ้ง: บอกว่ากำลังส่งต่อ
-- ----------------------------------------------------------------------------
create or replace function public.get_case_tracking(p_case_code text, p_phone_last4 text DEFAULT NULL::text, p_tracking_token text DEFAULT NULL::text, p_client_ip text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
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
    -- TF-59: กำลังส่งต่อ — ไม่บอกชื่อหน่วยปลายทางจนกว่าจะรับ
    'transferPending', exists (
      select 1 from public.case_transfers t where t.case_id = v_case.id and t.status = 'pending'
    ),
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
$function$;

-- ----------------------------------------------------------------------------
-- 18. แอดมินตั้งพิกัดหน่วย
-- ----------------------------------------------------------------------------
create or replace function public.admin_manage(p_action text, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := rls.current_user_id();
  v_unit uuid;
  v_user uuid;
  v_previous_leader uuid;
  v_previous text;
  v_status public.user_status;
  v_code text;
  v_enabled boolean;
  v_caps text[];
  v_lat double precision;
  v_lng double precision;
begin
  if not rls.is_admin() then raise exception 'admin required' using errcode = '42501'; end if;
  if p_action = 'create_unit' then
    if nullif(btrim(p_input->>'name'), '') is null or length(p_input->>'name') > 150
      or not exists (select 1 from public.provinces where name_th = p_input->>'province') then
      raise exception 'invalid unit' using errcode = '22023';
    end if;
    insert into public.units(name, province) values(btrim(p_input->>'name'), p_input->>'province') returning id into v_unit;
    insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
      values(v_actor, 'UNIT_CREATED', 'unit', v_unit, jsonb_build_object('name', btrim(p_input->>'name'), 'province', p_input->>'province'));
    if nullif(p_input->>'leaderId','') is not null then
      perform public.admin_manage('assign_leader', jsonb_build_object('unitId', v_unit, 'userId', p_input->>'leaderId'));
    end if;
    return jsonb_build_object('unitId', v_unit);
  elsif p_action = 'assign_leader' then
    v_unit := (p_input->>'unitId')::uuid; v_user := (p_input->>'userId')::uuid;
    if not exists (select 1 from public.units where id=v_unit and is_active)
      or not exists (select 1 from public.users where id=v_user and status='ACTIVE') then
      raise exception 'invalid unit or user' using errcode = '22023';
    end if;
    select lead_user_id into v_previous_leader from public.units where id=v_unit for update;
    update public.unit_members set role_in_unit='MEMBER'
      where unit_id=v_unit and role_in_unit='LEAD' and user_id <> v_user;
    update public.users u set role = case when exists (
      select 1 from public.unit_members m join public.units un on un.id=m.unit_id and un.is_active
      where m.user_id=u.id and m.status='APPROVED' and (m.expires_at is null or m.expires_at > now())
    ) then 'RESCUER'::public.user_role else 'USER'::public.user_role end
    where u.role='UNIT_LEAD' and u.id <> v_user
      and exists (select 1 from public.unit_members m where m.unit_id=v_unit and m.user_id=u.id)
      and not exists (select 1 from public.unit_members m join public.units un on un.id=m.unit_id and un.is_active
        where m.user_id=u.id and m.role_in_unit='LEAD' and m.status='APPROVED'
          and (m.expires_at is null or m.expires_at > now()));
    insert into public.unit_members(unit_id,user_id,role_in_unit,status,approved_by)
      values(v_unit,v_user,'LEAD','APPROVED',v_actor)
      on conflict(unit_id,user_id) do update set role_in_unit='LEAD', status='APPROVED', approved_by=v_actor;
    update public.users set role='UNIT_LEAD' where id=v_user and role <> 'ADMIN';
    update public.units set lead_user_id=v_user where id=v_unit;
    insert into public.audit_logs(actor_user_id,action,target_type,target_id,target_user_id,metadata)
      values(v_actor,'UNIT_LEADER_ASSIGNED','unit',v_unit,v_user,jsonb_build_object('previous_leader_id',v_previous_leader));
    return jsonb_build_object('unitId',v_unit,'userId',v_user);
  elsif p_action = 'user_status' then
    v_user := (p_input->>'userId')::uuid;
    if p_input->>'status' not in ('ACTIVE','SUSPENDED') then raise exception 'invalid status' using errcode='22023'; end if;
    v_status := (p_input->>'status')::public.user_status;
    if v_user = v_actor and v_status = 'SUSPENDED' then
      raise exception 'cannot suspend own account' using errcode = '42501';
    end if;
    select status::text into v_previous from public.users where id=v_user for update;
    if not found then raise exception 'user missing' using errcode='22023'; end if;
    update public.users set status=v_status where id=v_user;
    insert into public.audit_logs(actor_user_id,action,target_type,target_id,target_user_id,metadata)
      values(v_actor,'USER_STATUS_CHANGED','user',v_user,v_user,jsonb_build_object('from',v_previous,'to',v_status));
    return jsonb_build_object('userId',v_user,'status',v_status);
  elsif p_action = 'capabilities' then
    v_unit := (p_input->>'unitId')::uuid;
    if not exists (select 1 from public.units where id=v_unit and is_active) or jsonb_typeof(p_input->'capabilities') is distinct from 'array' then
      raise exception 'invalid unit or capabilities' using errcode='22023';
    end if;
    select coalesce(array_agg(distinct item), '{}') into v_caps from jsonb_array_elements_text(p_input->'capabilities') as item;
    if exists(select 1 from unnest(v_caps) c where c not in ('BOAT','EMS','FIRE_SUPPRESSION','EXTRICATION','WATER_RESCUE','ANIMAL_CAPTURE','EVACUATION')) then
      raise exception 'invalid capability' using errcode='22023';
    end if;
    delete from public.unit_capabilities where unit_id=v_unit;
    insert into public.unit_capabilities(unit_id,capability) select v_unit, unnest(v_caps);
    insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
      values(v_actor,'UNIT_CAPABILITIES_CHANGED','unit',v_unit,jsonb_build_object('capabilities',v_caps));
    return jsonb_build_object('unitId',v_unit,'capabilities',v_caps);
  elsif p_action = 'unit_location' then
    -- TF-59: พิกัดที่ตั้งหน่วย (lat/lng เป็น null = ล้าง กลับไปใช้จุดกลางอำเภอ/จังหวัด)
    v_unit := (p_input->>'unitId')::uuid;
    v_lat := (p_input->>'lat')::double precision;
    v_lng := (p_input->>'lng')::double precision;
    if not exists (select 1 from public.units where id = v_unit)
      or (v_lat is null) <> (v_lng is null)
      or (v_lat is not null and (v_lat not between 5 and 21 or v_lng not between 97 and 106)) then
      raise exception 'invalid unit location' using errcode = '22023';
    end if;
    update public.units
      set location = case when v_lat is null then null
        else extensions.st_setsrid(extensions.st_makepoint(v_lng, v_lat), 4326)::extensions.geography end
      where id = v_unit;
    insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
      values(v_actor, 'UNIT_LOCATION_CHANGED', 'unit', v_unit, jsonb_build_object('lat', v_lat, 'lng', v_lng));
    return jsonb_build_object('unitId', v_unit, 'lat', v_lat, 'lng', v_lng);
  elsif p_action = 'incident_type' then
    v_code := p_input->>'code';
    if jsonb_typeof(p_input->'enabled') is distinct from 'boolean' then raise exception 'invalid enabled flag' using errcode='22023'; end if;
    v_enabled := (p_input->>'enabled')::boolean;
    -- TF-54 must approve content before other incident forms can be enabled.
    if v_enabled and v_code <> 'FLOOD' then
      raise exception 'incident content not ready' using errcode = '22023';
    end if;
    update public.incident_types set is_enabled=v_enabled where code=v_code;
    if not found then raise exception 'invalid incident type' using errcode='22023'; end if;
    insert into public.audit_logs(actor_user_id,action,target_type,metadata)
      values(v_actor,'INCIDENT_TYPE_CHANGED','incident_type',jsonb_build_object('code',v_code,'enabled',v_enabled));
    return jsonb_build_object('code',v_code,'enabled',v_enabled);
  end if;
  raise exception 'invalid action' using errcode='22023';
end;
$function$;

-- ----------------------------------------------------------------------------
-- 19. TF-57: เคสที่ส่งต่อออกไป (หน่วยปลายทางกดรับแล้ว) นับเป็น "ส่งต่อ" ให้หน่วยเดิม ณ วันที่รับ
--     ผลงานช่วยสำเร็จยังนับให้ assigned_unit_id ตอนปิดเคส = หน่วยที่รับต่อ
-- ----------------------------------------------------------------------------
create or replace view rls.unit_case_outcomes as
 SELECT c.assigned_unit_id AS unit_id,
    (c.resolved_at AT TIME ZONE 'Asia/Bangkok'::text)::date AS day,
    c.incident_type,
    (c.close_confirmation = 'REPORTER_CONFIRMED'::text)::integer AS helped,
    (c.close_confirmation = 'LEAD_UNCONFIRMED'::text)::integer AS lead_closed,
    0 AS referred,
    0 AS released,
    COALESCE(c.rescued_count, ( SELECT (e.metadata ->> 'peopleHelped'::text)::integer AS int4
           FROM case_events e
          WHERE e.case_id = c.id AND e.event_type = 'STATUS_CHANGED'::case_event_type AND e.to_status = 'AWAITING_CONFIRMATION'::case_status
          ORDER BY e.created_at DESC
         LIMIT 1), 0) AS people_helped
   FROM cases c
  WHERE c.status = 'RESOLVED'::case_status AND c.assigned_unit_id IS NOT NULL AND c.resolved_at IS NOT NULL AND (c.close_confirmation = ANY (ARRAY['REPORTER_CONFIRMED'::text, 'LEAD_UNCONFIRMED'::text])) AND NOT (EXISTS ( SELECT 1
           FROM case_performance_reviews r
          WHERE r.case_id = c.id AND r.status <> 'APPROVED'::text))
UNION ALL
 SELECT e.actor_unit_id AS unit_id,
    (e.created_at AT TIME ZONE 'Asia/Bangkok'::text)::date AS day,
    c.incident_type,
    0 AS helped,
    0 AS lead_closed,
    0 AS referred,
    1 AS released,
    0 AS people_helped
   FROM case_events e
     JOIN cases c ON c.id = e.case_id
  WHERE e.event_type = 'RELEASED'::case_event_type AND e.actor_unit_id IS NOT NULL
UNION ALL
 SELECT t.from_unit_id AS unit_id,
    (t.decided_at AT TIME ZONE 'Asia/Bangkok'::text)::date AS day,
    c.incident_type,
    0 AS helped,
    0 AS lead_closed,
    1 AS referred,
    0 AS released,
    0 AS people_helped
   FROM public.case_transfers t
     JOIN public.cases c ON c.id = t.case_id
  WHERE t.status = 'accepted'::text;
