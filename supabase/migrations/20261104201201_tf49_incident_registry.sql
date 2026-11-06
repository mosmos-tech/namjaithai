-- ============================================================================
-- TF-49: ทะเบียนประเภทเหตุ + ปรับฐานข้อมูลรองรับเหตุฉุกเฉินทุกประเภท
--
--   1. incident_types       รหัสประเภทเหตุ 8 แบบ ตรงกับ src/lib/domain/incidents (มี test เทียบ)
--   2. cases.incident_type  ทุกเคสมีประเภทเหตุ เคสเดิมทั้งหมดเป็น FLOOD
--   3. cases.details        คำตอบเฉพาะประเภทเหตุ (jsonb) ย้ายระดับน้ำมาเป็น details.waterLevel
--                           แล้วลบคอลัมน์ water_level ทิ้ง ให้ระดับน้ำมีที่เดียว ไม่มีวันค่าไม่ตรงกัน
--                           ห้ามมีชื่อ เบอร์ ที่อยู่ละเอียด หรือข้อมูลสุขภาพ (check constraint)
--   4. case_sensitive_details  ข้อมูลสุขภาพ แยกตาราง เห็นเฉพาะกู้ภัยที่รับเคส
--                           หัวหน้าหน่วยที่รับเคส และแอดมิน
--   5. create_sos_case()    เขียนประเภทเหตุและ details แทน water_level
-- ============================================================================

set search_path = public, extensions;

-- ----------------------------------------------------------------------------
-- 1. incident_types
--    is_enabled = ผู้แจ้งเลือกได้ไหม: เปิดแค่ FLOOD จนกว่าเนื้อหาประเภทอื่นจะผ่านการตรวจ (TF-54)
--    แอดมินเปิด/ปิดได้ใน TF-30
-- ----------------------------------------------------------------------------
create table public.incident_types (
  code text primary key check (code ~ '^[A-Z_]+$'),
  sort_order integer not null unique,
  is_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_incident_types_updated_at
  before update on public.incident_types
  for each row execute function public.set_updated_at();

insert into public.incident_types (code, sort_order, is_enabled) values
  ('FLOOD', 1, true),
  ('FIRE', 2, false),
  ('ROAD_ACCIDENT', 3, false),
  ('MEDICAL', 4, false),
  ('WATER_RESCUE', 5, false),
  ('COLLAPSE', 6, false),
  ('ANIMAL', 7, false),
  ('OTHER', 8, false);

comment on table public.incident_types is
  'ประเภทเหตุ (TF-49) รหัสต้องตรงกับ src/lib/domain/incidents เนื้อหาคำถาม/คำแนะนำอยู่ในโค้ด';

-- ทุกคนอ่านได้ (เป็นแค่รายการรหัส) เขียนได้เฉพาะ service_role
alter table public.incident_types enable row level security;
revoke all on public.incident_types from anon, authenticated;
grant select on public.incident_types to anon, authenticated;
create policy "anyone reads incident types" on public.incident_types
  for select to anon, authenticated
  using (true);

-- ----------------------------------------------------------------------------
-- 2–3. cases.incident_type + cases.details (ย้ายระดับน้ำเข้า details แล้วลบคอลัมน์เดิม)
-- ----------------------------------------------------------------------------
alter table public.cases
  add column incident_type text not null default 'FLOOD' references public.incident_types (code),
  add column details jsonb not null default '{}'::jsonb;

update public.cases
set details = jsonb_build_object('waterLevel', water_level::text)
where water_level is not null;

alter table public.cases drop column water_level;

-- รายการ key ต้องห้ามตรงกับ FORBIDDEN_DETAIL_KEYS ใน src/lib/domain/incidents/types.ts
alter table public.cases
  add constraint cases_details_is_object check (jsonb_typeof(details) = 'object'),
  add constraint cases_details_no_personal_data
    check (not (details ?| array['name', 'phone', 'lineId', 'detailedAddress', 'health'])),
  add constraint cases_details_water_level_valid
    check (
      details ->> 'waterLevel' is null
      or details ->> 'waterLevel' = any (enum_range(null::public.water_level)::text[])
    );

create index idx_cases_incident_type_status on public.cases (incident_type, status);

comment on column public.cases.incident_type is 'ประเภทเหตุ (TF-49) อ้างอิง incident_types.code';
comment on column public.cases.details is
  'คำตอบเฉพาะประเภทเหตุ เช่น {"waterLevel":"ROOF"} ห้ามมีชื่อ เบอร์ ที่อยู่ละเอียด หรือข้อมูลสุขภาพ';

-- ----------------------------------------------------------------------------
-- 4. case_sensitive_details: ข้อมูลสุขภาพ (ข้อมูลอ่อนไหวตาม PDPA)
--    เขียนผ่านฟังก์ชันฝั่งเซิร์ฟเวอร์ (service_role) เท่านั้น
--    TODO(TF-44): ลบแถวนี้พร้อมข้อมูลส่วนตัวอื่นเมื่อปิดเคสครบกำหนด
-- ----------------------------------------------------------------------------
create table public.case_sensitive_details (
  case_id uuid primary key references public.cases (id) on delete cascade,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_case_sensitive_details_updated_at
  before update on public.case_sensitive_details
  for each row execute function public.set_updated_at();

-- เห็นข้อมูลสุขภาพของเคสนี้ไหม: แอดมิน / กู้ภัยที่รับเคส / หัวหน้าของหน่วยที่รับเคส
-- (ต่างจาก can_see_case_private: หัวหน้าหน่วยเห็นได้ ตามเกณฑ์ TF-49)
create or replace function rls.can_see_case_sensitive(p_case_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select rls.is_admin() or exists (
    select 1 from public.cases c
    where c.id = p_case_id
      and (
        c.assigned_rescuer_id = rls.current_user_id()
        or c.assigned_unit_id in (select rls.my_unit_ids(true))
      )
  )
$$;

revoke all on function rls.can_see_case_sensitive(uuid) from public;
grant execute on function rls.can_see_case_sensitive(uuid) to anon, authenticated;

alter table public.case_sensitive_details enable row level security;
revoke all on public.case_sensitive_details from anon, authenticated;
grant select on public.case_sensitive_details to authenticated;
create policy "read sensitive details of accepted cases" on public.case_sensitive_details
  for select to authenticated
  using (rls.can_see_case_sensitive(case_id));

comment on table public.case_sensitive_details is
  'ข้อมูลสุขภาพของเคส (TF-49) เห็นเฉพาะกู้ภัยที่รับเคส หัวหน้าหน่วยที่รับเคส และแอดมิน';

-- ----------------------------------------------------------------------------
-- 5. create_sos_case(): คัดลอกจาก TF-16 (20261030195500) แก้เฉพาะ
--    - ตรวจ incidentType ว่าเปิดใช้อยู่ (ไม่ส่งมา = FLOOD)
--    - ระดับน้ำเขียน/อ่านที่ details.waterLevel แทนคอลัมน์ water_level
--    - ดึงเคสซ้ำด้วย c.* into v_dup_case (ของเดิมไล่ทีละคอลัมน์ตามลำดับ จะพังเมื่อคอลัมน์เปลี่ยน)
-- ----------------------------------------------------------------------------
create or replace function public.create_sos_case(
  p_idempotency_key text,
  p_payload jsonb,
  p_priority_score integer,
  p_client_ip text default null,
  p_reporter_user_id uuid default null
)
returns table (
  case_id uuid,
  case_code text,
  tracking_token text,
  status public.case_status,
  created_at timestamptz,
  replayed boolean,
  updated_existing boolean,
  is_potential_duplicate boolean,
  duplicate_of_case_id uuid,
  duplicate_of_case_code text,
  duplicate_distance_m double precision
)
language plpgsql
set search_path = public, extensions
as $$
declare
  -- กติกา rate limit: ช่วงเวลา 1 ชั่วโมง
  -- เบอร์เดียวกันส่งได้ 5 เคส / IP เดียวกันส่งได้ 20 เคส
  c_window constant interval := interval '1 hour';
  c_phone_limit constant integer := 5;
  c_ip_limit constant integer := 20;

  -- กติกาตรวจเคสซ้ำ (TF-16): ห่างไม่ถึง 50 เมตร ภายใน 24 ชั่วโมง
  c_dup_distance_m constant double precision := 50.0;
  c_dup_window constant interval := interval '24 hours';

  v_phone text := p_payload ->> 'phone';
  v_lat double precision := (p_payload ->> 'lat')::double precision;
  v_lng double precision := (p_payload ->> 'lng')::double precision;
  v_point geography(Point, 4326);
  v_duplicate_action text := coalesce(nullif(btrim(p_payload ->> 'duplicateAction'), ''), 'ASK');
  v_target_case_id uuid := nullif(btrim(p_payload ->> 'targetCaseId'), '')::uuid;
  -- TF-49: ไม่ส่งมา = น้ำท่วม (ฟอร์มเดิมยังไม่ได้ส่งประเภทเหตุ)
  v_incident_type text := coalesce(nullif(btrim(p_payload ->> 'incidentType'), ''), 'FLOOD');

  v_phone_bucket text;
  v_ip_bucket text;
  v_hits integer;
  v_oldest timestamptz;
  v_period text;
  v_seq integer;
  v_case public.cases%rowtype;
  v_constraint text;

  v_dup_found boolean := false;
  v_dup_case public.cases%rowtype;
  v_dup_same_phone boolean := false;
  v_dup_nearby boolean := false;
  v_dup_dist_m double precision := null;
  v_dup_code text := null;
  v_match_reason text := null;
begin
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'idempotency key is required' using errcode = '22023';
  end if;

  if v_phone is null or v_phone !~ '^\d{9,10}$' then
    raise exception 'payload.phone must be 9-10 digits' using errcode = '22023';
  end if;

  -- TF-49: รับเฉพาะประเภทเหตุที่เปิดใช้ (ตอนนี้เปิดแค่ FLOOD จนกว่าเนื้อหาประเภทอื่นจะผ่าน TF-54)
  if not exists (
    select 1 from public.incident_types t where t.code = v_incident_type and t.is_enabled
  ) then
    raise exception 'incident type % is not available', v_incident_type using errcode = '22023';
  end if;

  -- (1) ส่งซ้ำด้วยคีย์เดิม → คืนเคสเดิม ไม่นับ rate limit และไม่สร้างเคสใหม่
  select * into v_case from public.cases c where c.idempotency_key = p_idempotency_key;
  if found then
    if v_case.duplicate_of_case_id is not null then
      select c2.case_code,
             round(ST_Distance(v_case.location, c2.location)::numeric, 1)::double precision
      into v_dup_code, v_dup_dist_m
      from public.cases c2
      where c2.id = v_case.duplicate_of_case_id;
    end if;

    return query select
      v_case.id,
      v_case.case_code,
      v_case.tracking_token,
      v_case.status,
      v_case.created_at,
      true,
      false,
      v_case.is_potential_duplicate,
      v_case.duplicate_of_case_id,
      v_dup_code,
      v_dup_dist_m;
    return;
  end if;

  -- (2) จำกัดจำนวนครั้งต่อเบอร์ / ต่อ IP
  v_phone_bucket := 'phone:' || encode(digest(v_phone, 'sha256'), 'hex');
  if p_client_ip is not null and btrim(p_client_ip) <> '' then
    v_ip_bucket := 'ip:' || encode(digest(btrim(p_client_ip), 'sha256'), 'hex');
  end if;

  delete from public.sos_rate_limit_hits h
  where h.bucket in (v_phone_bucket, v_ip_bucket)
    and h.created_at < now() - c_window;

  select count(*), min(h.created_at) into v_hits, v_oldest
  from public.sos_rate_limit_hits h
  where h.bucket = v_phone_bucket and h.created_at >= now() - c_window;

  if v_hits >= c_phone_limit then
    raise exception 'rate limit exceeded for phone'
      using errcode = 'SOS29',
            detail = 'phone',
            hint = greatest(1, ceil(extract(epoch from (v_oldest + c_window - now()))))::text;
  end if;

  if v_ip_bucket is not null then
    select count(*), min(h.created_at) into v_hits, v_oldest
    from public.sos_rate_limit_hits h
    where h.bucket = v_ip_bucket and h.created_at >= now() - c_window;

    if v_hits >= c_ip_limit then
      raise exception 'rate limit exceeded for ip'
        using errcode = 'SOS29',
              detail = 'ip',
              hint = greatest(1, ceil(extract(epoch from (v_oldest + c_window - now()))))::text;
    end if;
  end if;

  -- (3) ตรวจหาเคสซ้ำที่ยังเปิดอยู่ (เบอร์เดียวกัน หรือ ห่างไม่ถึง 50 ม. ภายใน 24 ชม.)
  v_point := ST_SetSRID(ST_MakePoint(v_lng, v_lat), 4326)::geography;

  select c.* into v_dup_case
  from public.cases c
  where c.status in ('NEW', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE')
    and (v_target_case_id is null or c.id = v_target_case_id)
    and (
      exists (
        select 1 from public.case_contacts cc
        where cc.case_id = c.id and cc.phone = v_phone
      )
      or (
        c.created_at >= now() - c_dup_window
        and ST_DWithin(c.location, v_point, c_dup_distance_m)
        and ST_Distance(c.location, v_point) < c_dup_distance_m
      )
    )
  order by
    case
      when exists (
        select 1 from public.case_contacts cc
        where cc.case_id = c.id and cc.phone = v_phone
      ) then 0
      else 1
    end asc,
    ST_Distance(c.location, v_point) asc,
    c.created_at desc
  limit 1;

  if found then
    v_dup_found := true;
    v_dup_same_phone := exists (
      select 1 from public.case_contacts cc
      where cc.case_id = v_dup_case.id and cc.phone = v_phone
    );
    v_dup_nearby := v_dup_case.created_at >= now() - c_dup_window
      and ST_Distance(v_dup_case.location, v_point) < c_dup_distance_m;
    v_dup_dist_m := round(ST_Distance(v_dup_case.location, v_point)::numeric, 1)::double precision;
    v_dup_code := v_dup_case.case_code;
    v_match_reason := case
      when v_dup_same_phone and v_dup_nearby then 'BOTH'
      when v_dup_same_phone then 'SAME_PHONE'
      else 'NEARBY_50M'
    end;
  end if;

  -- (3.1) ถ้าพบเคสซ้ำและผู้แจ้งยังไม่ได้เลือก (ASK) → โยน SOS49 ให้หน้าเว็บถามผู้แจ้ง
  if v_dup_found and v_duplicate_action = 'ASK' then
    raise exception 'duplicate case candidate detected'
      using errcode = 'SOS49',
            detail = jsonb_build_object(
              'caseId', v_dup_case.id,
              'caseCode', v_dup_case.case_code,
              'status', v_dup_case.status,
              'urgency', v_dup_case.urgency,
              'incidentType', v_dup_case.incident_type,
              'waterLevel', v_dup_case.details ->> 'waterLevel',
              'createdAt', v_dup_case.created_at,
              'matchReason', v_match_reason,
              'distanceM', v_dup_dist_m
            )::text;
  end if;

  -- (3.2) ถ้าผู้แจ้งเลือก "อัปเดตเคสเดิม" (UPDATE_EXISTING) และเคสเดิมยังเปิดอยู่
  if v_dup_found and v_duplicate_action = 'UPDATE_EXISTING' then
    update public.cases c
    set urgency = (p_payload ->> 'urgency')::public.urgency_level,
        -- ส่งระดับน้ำมาใหม่ก็ทับค่าเดิม ไม่ส่งมาก็คงค่าเดิมไว้
        details = c.details || jsonb_strip_nulls(jsonb_build_object(
          'waterLevel', nullif(btrim(p_payload ->> 'waterLevel'), '')
        )),
        priority_score = greatest(c.priority_score, p_priority_score),
        lat = v_lat,
        lng = v_lng,
        accuracy_m = coalesce((p_payload ->> 'accuracyM')::double precision, c.accuracy_m),
        landmark = p_payload ->> 'landmark',
        notes = coalesce(nullif(btrim(p_payload ->> 'notes'), ''), c.notes),
        last_status_updated_at = now(),
        version = c.version + 1
    where c.id = v_dup_case.id
    returning * into v_case;

    update public.case_people
    set adults = coalesce((p_payload ->> 'adults')::integer, 0),
        elderly = coalesce((p_payload ->> 'elderly')::integer, 0),
        bedridden = coalesce((p_payload ->> 'bedridden')::integer, 0),
        children = coalesce((p_payload ->> 'children')::integer, 0),
        pets = coalesce((p_payload ->> 'pets')::integer, 0)
    where case_id = v_case.id;

    delete from public.case_needs where case_id = v_case.id;
    insert into public.case_needs (case_id, need, other_detail)
    select
      v_case.id,
      n.need::public.need_type,
      case when n.need = 'OTHER' then btrim(p_payload ->> 'otherDetail') end
    from (
      select distinct jsonb_array_elements_text(coalesce(p_payload -> 'needs', '[]'::jsonb)) as need
    ) n;

    if exists (
      select 1 from public.case_contacts cc
      where cc.case_id = v_case.id and cc.phone = v_phone
    ) then
      update public.case_contacts
      set name = coalesce(nullif(btrim(p_payload ->> 'name'), ''), name),
          line_id = coalesce(nullif(btrim(p_payload ->> 'lineId'), ''), line_id)
      where case_id = v_case.id and phone = v_phone;
    else
      insert into public.case_contacts (case_id, name, phone, phone_last4, line_id, is_primary)
      values (
        v_case.id,
        p_payload ->> 'name',
        v_phone,
        right(v_phone, 4),
        nullif(btrim(p_payload ->> 'lineId'), ''),
        false
      );
    end if;

    insert into public.case_events (
      case_id, event_type, from_status, to_status, actor_user_id, actor_role, metadata
    )
    values (
      v_case.id,
      'REPORTER_UPDATED',
      v_case.status,
      v_case.status,
      p_reporter_user_id,
      case when p_reporter_user_id is null then 'GUEST' else 'USER' end,
      jsonb_build_object(
        'source', 'DUPLICATE_CHECK_UPDATE',
        'idempotency_key', p_idempotency_key,
        'match_reason', v_match_reason,
        'distance_m', v_dup_dist_m,
        'priority_score', v_case.priority_score
      )
    );

    insert into public.sos_rate_limit_hits (bucket)
    select b from unnest(array[v_phone_bucket, v_ip_bucket]) as b where b is not null;

    return query select
      v_case.id,
      v_case.case_code,
      v_case.tracking_token,
      v_case.status,
      v_case.created_at,
      false,
      true,
      v_case.is_potential_duplicate,
      v_case.duplicate_of_case_id,
      null::text,
      v_dup_dist_m;
    return;
  end if;

  -- (4) สร้างเคสใหม่ (กรณีไม่ซ้ำ หรือผู้แจ้งยืนยันเลือก "สร้างใหม่" CREATE_NEW)
  --     ถ้ามีเคสใกล้กันใน 50 ม. หรือเบอร์ซ้ำ จะทำเครื่องหมาย is_potential_duplicate = true ให้แอดมินเห็น
  begin
    v_period := to_char(now() at time zone 'Asia/Bangkok', 'YYMM');

    insert into public.case_code_counters as cc (period, last_value)
    values (v_period, 1)
    on conflict (period) do update set last_value = cc.last_value + 1
    returning cc.last_value into v_seq;

    insert into public.cases (
      case_code, idempotency_key, reporter_user_id, status,
      urgency, incident_type, details, priority_score,
      lat, lng, accuracy_m,
      province, district, subdistrict, landmark, notes, source,
      is_potential_duplicate, duplicate_of_case_id
    )
    values (
      'FL-' || v_period || '-' || case when v_seq < 10000 then lpad(v_seq::text, 4, '0') else v_seq::text end,
      p_idempotency_key,
      p_reporter_user_id,
      'NEW',
      (p_payload ->> 'urgency')::public.urgency_level,
      v_incident_type,
      jsonb_strip_nulls(jsonb_build_object('waterLevel', nullif(btrim(p_payload ->> 'waterLevel'), ''))),
      p_priority_score,
      v_lat,
      v_lng,
      (p_payload ->> 'accuracyM')::double precision,
      nullif(btrim(p_payload ->> 'province'), ''),
      nullif(btrim(p_payload ->> 'district'), ''),
      nullif(btrim(p_payload ->> 'subdistrict'), ''),
      p_payload ->> 'landmark',
      nullif(btrim(p_payload ->> 'notes'), ''),
      'WEB',
      v_dup_found,
      case when v_dup_found then v_dup_case.id else null end
    )
    returning * into v_case;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'cases_idempotency_key_key' then
        select * into v_case from public.cases c where c.idempotency_key = p_idempotency_key;
        return query select
          v_case.id,
          v_case.case_code,
          v_case.tracking_token,
          v_case.status,
          v_case.created_at,
          true,
          false,
          v_case.is_potential_duplicate,
          v_case.duplicate_of_case_id,
          v_dup_code,
          v_dup_dist_m;
        return;
      end if;
      raise;
  end;

  insert into public.case_contacts (case_id, name, phone, phone_last4, line_id)
  values (
    v_case.id,
    p_payload ->> 'name',
    v_phone,
    right(v_phone, 4),
    nullif(btrim(p_payload ->> 'lineId'), '')
  );

  insert into public.case_people (case_id, adults, elderly, bedridden, children, pets)
  values (
    v_case.id,
    coalesce((p_payload ->> 'adults')::integer, 0),
    coalesce((p_payload ->> 'elderly')::integer, 0),
    coalesce((p_payload ->> 'bedridden')::integer, 0),
    coalesce((p_payload ->> 'children')::integer, 0),
    coalesce((p_payload ->> 'pets')::integer, 0)
  );

  insert into public.case_needs (case_id, need, other_detail)
  select
    v_case.id,
    n.need::public.need_type,
    case when n.need = 'OTHER' then btrim(p_payload ->> 'otherDetail') end
  from (
    select distinct jsonb_array_elements_text(coalesce(p_payload -> 'needs', '[]'::jsonb)) as need
  ) n;

  insert into public.case_events (
    case_id, event_type, from_status, to_status, actor_user_id, actor_role, metadata
  )
  values (
    v_case.id,
    'CREATED',
    null,
    'NEW',
    p_reporter_user_id,
    case when p_reporter_user_id is null then 'GUEST' else 'USER' end,
    case
      when v_dup_found then
        jsonb_build_object(
          'source', v_case.source,
          'priority_score', p_priority_score,
          'is_potential_duplicate', true,
          'duplicate_of_case_id', v_dup_case.id,
          'duplicate_of_case_code', v_dup_code,
          'duplicate_match_reason', v_match_reason,
          'duplicate_distance_m', v_dup_dist_m
        )
      else
        jsonb_build_object(
          'source', v_case.source,
          'priority_score', p_priority_score
        )
    end
  );

  insert into public.sos_rate_limit_hits (bucket)
  select b from unnest(array[v_phone_bucket, v_ip_bucket]) as b where b is not null;

  return query select
    v_case.id,
    v_case.case_code,
    v_case.tracking_token,
    v_case.status,
    v_case.created_at,
    false,
    false,
    v_case.is_potential_duplicate,
    v_case.duplicate_of_case_id,
    v_dup_code,
    v_dup_dist_m;
end;
$$;

comment on function public.create_sos_case(text, jsonb, integer, text, uuid) is
  'สร้างเคส SOS พร้อมตรวจเคสซ้ำ (เบอร์เดียวกันที่เปิดอยู่ หรือห่างไม่ถึง 50 ม. ภายใน 24 ชม.) '
  'รองรับตัวเลือกอัปเดตเคสเดิม (UPDATE_EXISTING) หรือสร้างใหม่พร้อมทำเครื่องหมายให้แอดมินเห็น (CREATE_NEW)';

revoke all on function public.create_sos_case(text, jsonb, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.create_sos_case(text, jsonb, integer, text, uuid) to service_role;
