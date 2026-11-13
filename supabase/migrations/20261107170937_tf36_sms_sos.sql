-- TF-36 · SOS ผ่าน SMS
--   1. cases.location_source รับค่า SMS (พิกัดอ่านจากข้อความ ไม่รู้ความแม่นยำ)
--   2. create_sos_case รับ payload.channel = SMS: บันทึก source = SMS, ความยินยอมฉบับ SMS,
--      location_source = SMS, accuracy_m = null (ที่เหลือคงเดิมจาก TF-62 + TF-65)
--   3. case_event_type เพิ่ม SMS_REPEATED (เบอร์เดิมส่ง SMS ซ้ำขณะเคสยังเปิด — ไม่เก็บเนื้อความ)
--   4. ตาราง sms_inbound_messages: กันประมวลผลข้อความเดิมซ้ำ + จำกัดการตอบกลับ (กันเปลืองเงิน/วนลูป)
--      เก็บเฉพาะผลที่อ่านได้ ไม่เก็บเนื้อความ SMS · แอดมินอ่านได้อย่างเดียว
--   5. pg_cron ล้างเบอร์และพิกัดของแถวที่เกิน 90 วัน

-- ----------------------------------------------------------------------------
-- 1. location_source = SMS
-- ----------------------------------------------------------------------------
alter table public.cases drop constraint cases_location_source_check;
alter table public.cases add constraint cases_location_source_check
  check (location_source is null or location_source in ('GPS', 'MANUAL_PIN', 'GMAPS_LINK', 'SMS'));

-- ----------------------------------------------------------------------------
-- 2. create_sos_case รองรับช่องทาง SMS
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
-- TF-65: ชื่อที่ซ้ำกับคอลัมน์ผลลัพธ์ (เช่น case_id ใน "where case_id = v_case.id") ให้หมายถึงคอลัมน์ในตาราง
-- ก่อนหน้านี้ทางเลือก UPDATE_EXISTING พังด้วย "column reference case_id is ambiguous"
#variable_conflict use_column
declare
  c_window constant interval := interval '1 hour';
  c_phone_limit constant integer := 5;
  c_ip_limit constant integer := 20;

  c_dup_distance_m constant double precision := 50.0;
  c_dup_window constant interval := interval '24 hours';

  v_phone text := p_payload ->> 'phone';
  v_lat double precision := (p_payload ->> 'lat')::double precision;
  v_lng double precision := (p_payload ->> 'lng')::double precision;
  v_point geography(Point, 4326);
  v_duplicate_action text := coalesce(nullif(btrim(p_payload ->> 'duplicateAction'), ''), 'ASK');
  v_target_case_id uuid := nullif(btrim(p_payload ->> 'targetCaseId'), '')::uuid;
  v_incident_type text := coalesce(nullif(btrim(p_payload ->> 'incidentType'), ''), 'FLOOD');
  -- TF-36: ช่องทางแจ้ง WEB (ฟอร์มเว็บ) / SMS (webhook รับ SMS) — ไม่ส่งมา = WEB
  v_channel text := coalesce(nullif(btrim(p_payload ->> 'channel'), ''), 'WEB');
  -- TF-65: วิธีได้พิกัด / ความคลาดเคลื่อน (ปักเอง/วางลิงก์ = null เสมอ) / ที่อยู่ละเอียด
  -- TF-36: SMS = พิกัดจาก SMS เสมอ และไม่รู้ความคลาดเคลื่อน (null)
  v_location_source text := case
    when coalesce(nullif(btrim(p_payload ->> 'channel'), ''), 'WEB') = 'SMS' then 'SMS'
    else nullif(btrim(p_payload ->> 'locationSource'), '')
  end;
  v_accuracy_m double precision := case
    when coalesce(nullif(btrim(p_payload ->> 'channel'), ''), 'WEB') = 'SMS' then null
    when nullif(btrim(p_payload ->> 'locationSource'), '') in ('MANUAL_PIN', 'GMAPS_LINK') then null
    else (p_payload ->> 'accuracyM')::double precision
  end;
  v_address text := nullif(btrim(p_payload ->> 'addressLine'), '');
  v_triage_reasons text[] := array(
    select jsonb_array_elements_text(coalesce(p_payload -> 'triageReasons', '[]'::jsonb))
  );
  v_details jsonb := coalesce(
    case when jsonb_typeof(p_payload -> 'details') = 'object' then p_payload -> 'details' end,
    '{}'::jsonb
  ) || jsonb_strip_nulls(jsonb_build_object(
    'waterLevel', nullif(btrim(p_payload ->> 'waterLevel'), ''),
    'canSelfEvacuate', p_payload -> 'canSelfEvacuate'
  ));
  v_sensitive jsonb := case
    when jsonb_typeof(p_payload -> 'sensitive') = 'object' and p_payload -> 'sensitive' <> '{}'::jsonb
      then p_payload -> 'sensitive'
  end;

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
  if v_channel not in ('WEB', 'SMS') then
    raise exception 'payload.channel must be WEB or SMS' using errcode = '22023';
  end if;

  -- TF-36: ฟอร์มเว็บแอบอ้างว่าพิกัดมาจาก SMS ไม่ได้
  if v_channel = 'WEB' and v_location_source = 'SMS' then
    raise exception 'payload.locationSource SMS is reserved for the SMS channel' using errcode = '22023';
  end if;

  -- TF-62 เว็บ: ยินยอมทั้งข้อมูลทั่วไปและข้อมูลสุขภาพตามฉบับของฟอร์ม
  -- TF-36 SMS: คนพิมพ์ SMS เองไม่เคยเห็นหน้ายินยอม ใช้ฉบับของช่องทาง SMS (ตอบกลับพร้อมลิงก์ /privacy)
  --            และไม่ได้ถามข้อมูลสุขภาพ จึงไม่บันทึก health_consented_at
  if p_payload -> 'consent' is distinct from 'true'::jsonb
    or (v_channel = 'WEB' and (
      p_payload -> 'healthConsent' is distinct from 'true'::jsonb
      or p_payload ->> 'consentVersion' is distinct from '2026-11-06'))
    or (v_channel = 'SMS' and p_payload ->> 'consentVersion' is distinct from 'SMS-2026-11-08') then
    raise exception 'consent required' using errcode = '22023';
  end if;

  -- TF-36: SMS ถามผู้แจ้งว่าจะอัปเดตเคสเดิมไหมไม่ได้ (webhook ตอบรหัสเคสเดิมกลับแทน)
  if v_channel = 'SMS' and v_duplicate_action = 'UPDATE_EXISTING' then
    raise exception 'SMS cannot update an existing case' using errcode = '22023';
  end if;

  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'idempotency key is required' using errcode = '22023';
  end if;

  if v_phone is null or v_phone !~ '^\d{9,10}$' then
    raise exception 'payload.phone must be 9-10 digits' using errcode = '22023';
  end if;

  if cardinality(v_triage_reasons) = 0 then
    raise exception 'payload.triageReasons is required' using errcode = '22023';
  end if;

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

  -- (3) ตรวจหาเคสซ้ำที่ยังเปิดอยู่
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

  -- (3.1) ถ้าพบเคสซ้ำและผู้แจ้งยังไม่ได้เลือก (ASK) → โยน SOS49
  if v_dup_found and v_duplicate_action = 'ASK' then
    raise exception 'duplicate case candidate detected'
      using errcode = 'SOS49',
            detail = jsonb_build_object(
              'caseId', v_dup_case.id,
              'caseCode', v_dup_case.case_code,
              'status', v_dup_case.status,
              'incidentType', v_dup_case.incident_type,
              'waterLevel', v_dup_case.details ->> 'waterLevel',
              'createdAt', v_dup_case.created_at,
              'matchReason', v_match_reason,
              'distanceM', v_dup_dist_m
            )::text;
  end if;

  -- (3.2) ถ้าผู้แจ้งเลือก "อัปเดตเคสเดิม" (UPDATE_EXISTING)
  if v_dup_found and v_duplicate_action = 'UPDATE_EXISTING' then
    update public.cases c
    set consent_version = p_payload ->> 'consentVersion',
        consented_at = now(), health_consented_at = now(),
        urgency = (p_payload ->> 'urgency')::public.urgency_level,
        triage_reasons = v_triage_reasons,
        system_urgency = null,
        urgency_override_reason = null,
        urgency_overridden_by = null,
        urgency_overridden_at = null,
        details = c.details || v_details,
        priority_score = greatest(c.priority_score, p_priority_score),
        lat = v_lat,
        lng = v_lng,
        -- TF-65: ปักเอง/วางลิงก์ล้างค่าเดิม, ร่างรุ่นเก่าที่ไม่ส่งวิธีมาคงค่าเดิม
        accuracy_m = case
          when v_location_source in ('MANUAL_PIN', 'GMAPS_LINK') then null
          else coalesce(v_accuracy_m, c.accuracy_m)
        end,
        location_source = coalesce(v_location_source, c.location_source),
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
          line_id = coalesce(nullif(btrim(p_payload ->> 'lineId'), ''), line_id),
          detailed_address = coalesce(v_address, detailed_address)
      where case_id = v_case.id and phone = v_phone;
    else
      insert into public.case_contacts (
        case_id, name, phone, phone_last4, line_id, detailed_address, is_primary
      )
      values (
        v_case.id,
        p_payload ->> 'name',
        v_phone,
        right(v_phone, 4),
        nullif(btrim(p_payload ->> 'lineId'), ''),
        v_address,
        false
      );
    end if;

    if v_sensitive is null then
      delete from public.case_sensitive_details where case_id = v_case.id;
    else
      insert into public.case_sensitive_details (case_id, details)
      values (v_case.id, v_sensitive)
      on conflict (case_id) do update set details = excluded.details;
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

  -- (4) สร้างเคสใหม่
  begin
    v_period := to_char(now() at time zone 'Asia/Bangkok', 'YYMM');

    insert into public.case_code_counters as cc (period, last_value)
    values (v_period, 1)
    on conflict (period) do update set last_value = cc.last_value + 1
    returning cc.last_value into v_seq;

    insert into public.cases (
      consent_version, consented_at, health_consented_at,
      case_code, idempotency_key, reporter_user_id, status,
      urgency, triage_reasons, incident_type, details, priority_score,
      lat, lng, accuracy_m, location_source,
      province, district, subdistrict, landmark, notes, source,
      is_potential_duplicate, duplicate_of_case_id
    )
    values (
      p_payload ->> 'consentVersion', now(), case when v_channel = 'WEB' then now() end,
      'FL-' || v_period || '-' || case when v_seq < 10000 then lpad(v_seq::text, 4, '0') else v_seq::text end,
      p_idempotency_key,
      p_reporter_user_id,
      'NEW',
      (p_payload ->> 'urgency')::public.urgency_level,
      v_triage_reasons,
      v_incident_type,
      v_details,
      p_priority_score,
      v_lat,
      v_lng,
      v_accuracy_m,
      v_location_source,
      nullif(btrim(p_payload ->> 'province'), ''),
      nullif(btrim(p_payload ->> 'district'), ''),
      nullif(btrim(p_payload ->> 'subdistrict'), ''),
      p_payload ->> 'landmark',
      nullif(btrim(p_payload ->> 'notes'), ''),
      v_channel,
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

  if v_sensitive is not null then
    insert into public.case_sensitive_details (case_id, details) values (v_case.id, v_sensitive);
  end if;

  insert into public.case_contacts (case_id, name, phone, phone_last4, line_id, detailed_address)
  values (
    v_case.id,
    p_payload ->> 'name',
    v_phone,
    right(v_phone, 4),
    nullif(btrim(p_payload ->> 'lineId'), ''),
    v_address
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

revoke all on function public.create_sos_case(text, jsonb, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.create_sos_case(text, jsonb, integer, text, uuid) to service_role;

-- ----------------------------------------------------------------------------
-- 3. เหตุการณ์ "ได้รับ SMS ซ้ำ" ในไทม์ไลน์
--    (ค่าใหม่ของ enum ใช้ใน transaction เดียวกันไม่ได้ แต่ฟังก์ชันข้างล่างอ่านตอนเรียกใช้จริง จึงไม่มีปัญหา)
-- ----------------------------------------------------------------------------
alter type public.case_event_type add value if not exists 'SMS_REPEATED';

-- ----------------------------------------------------------------------------
-- 4. sms_inbound_messages
-- ----------------------------------------------------------------------------
create table public.sms_inbound_messages (
  id uuid primary key default gen_random_uuid(),
  -- ผู้ให้บริการ (เช่น httpsms) + รหัสข้อความของเขา — ข้อความเดิมส่งมาซ้ำจะไม่สร้างเคส/ตอบซ้ำ
  provider text not null check (provider ~ '^[a-z0-9_-]{1,32}$'),
  provider_message_id text not null check (length(provider_message_id) between 1 and 128),
  -- เบอร์ผู้ส่ง (0812345678) และพิกัดที่อ่านได้ — ล้างเป็น null เมื่อเกิน 90 วัน
  phone text check (phone is null or phone ~ '^\d{9,10}$'),
  lat double precision,
  lng double precision,
  result text check (result in (
    'CREATED', 'REPEAT', 'INVALID', 'UNSUPPORTED_INCIDENT', 'RATE_LIMITED', 'ERROR'
  )),
  -- เหตุผลที่อ่านไม่ได้ (NOT_SOS / BAD_FORMAT / NO_LOCATION / OUT_OF_AREA) ไม่ใช่เนื้อความ
  parse_error text check (parse_error is null or parse_error ~ '^[A-Z_]{1,32}$'),
  case_id uuid references public.cases(id) on delete set null,
  reply_kind text check (reply_kind in (
    'CREATED', 'REPEAT', 'HELP', 'UNSUPPORTED_INCIDENT', 'RATE_LIMITED', 'ERROR'
  )),
  replied_at timestamptz,
  created_at timestamptz not null default now(),
  pii_purged_at timestamptz,
  unique (provider, provider_message_id)
);

comment on table public.sms_inbound_messages is
  'TF-36 SMS SOS ที่รับเข้ามา: ผลการอ่าน เคสที่สร้าง และการตอบกลับ (ไม่เก็บเนื้อความ · ล้างเบอร์/พิกัดเมื่อเกิน 90 วัน)';

create index sms_inbound_messages_phone_replied_idx
  on public.sms_inbound_messages (phone, replied_at desc)
  where phone is not null and replied_at is not null;
create index sms_inbound_messages_retention_idx
  on public.sms_inbound_messages (created_at)
  where pii_purged_at is null;

alter table public.sms_inbound_messages enable row level security;
revoke all on public.sms_inbound_messages from anon, authenticated;
grant select on public.sms_inbound_messages to authenticated;

create policy "admin reads sms inbound" on public.sms_inbound_messages
  for select to authenticated
  using ((select rls.is_admin()));

-- 4.1 บันทึกข้อความที่เข้ามา — ข้อความเดิม (ผู้ให้บริการส่งซ้ำ) ได้แถวเดิมกลับไป
--     handled = true แปลว่าเคยประมวลผลจบแล้ว ไม่ต้องสร้างเคสหรือตอบซ้ำ
create function public.record_sms_inbound(
  p_provider text,
  p_message_id text,
  p_phone text
)
returns table (id uuid, handled boolean)
language plpgsql
set search_path = public
as $$
#variable_conflict use_column
declare
  v_row public.sms_inbound_messages%rowtype;
begin
  insert into public.sms_inbound_messages (provider, provider_message_id, phone)
  values (p_provider, p_message_id, p_phone)
  on conflict (provider, provider_message_id) do nothing
  returning * into v_row;

  if not found then
    select * into v_row
    from public.sms_inbound_messages m
    where m.provider = p_provider and m.provider_message_id = p_message_id;
  end if;

  return query select v_row.id, v_row.result is not null;
end;
$$;

-- 4.2 บันทึกผล และตัดสินว่าควรตอบกลับไหม
--     ตอบ "สร้างเคสแล้ว" เสมอ · คำตอบอื่น (วิธีส่ง/เคสเดิม/ส่งบ่อย/ระบบขัดข้อง) ไม่เกิน 1 ครั้งต่อเบอร์ต่อ 10 นาที
--     กันเปลืองค่า SMS และกันวนลูปกับเครื่องที่ตอบกลับอัตโนมัติ
--     REPEAT: บันทึก case_events SMS_REPEATED (ไม่เกิน 1 ครั้งต่อเคสต่อ 10 นาที ไม่เก็บเนื้อความ)
create function public.finish_sms_inbound(
  p_id uuid,
  p_result text,
  p_case_id uuid default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_parse_error text default null,
  p_reply_kind text default null
)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  c_reply_window constant interval := interval '10 minutes';
  v_phone text;
  v_status public.case_status;
  v_reply boolean;
begin
  select m.phone into v_phone from public.sms_inbound_messages m where m.id = p_id;
  if not found then
    raise exception 'sms inbound % not found', p_id using errcode = 'P0002';
  end if;

  -- เรียงคำขอจากเบอร์เดียวกัน ไม่ให้สองข้อความที่มาพร้อมกันตอบกลับทั้งคู่
  perform pg_advisory_xact_lock(hashtextextended('tf36-sms:' || coalesce(v_phone, p_id::text), 0));

  update public.sms_inbound_messages m
  set result = p_result,
      case_id = p_case_id,
      lat = p_lat,
      lng = p_lng,
      parse_error = p_parse_error
  where m.id = p_id;

  if p_result = 'REPEAT' and p_case_id is not null then
    select c.status into v_status from public.cases c where c.id = p_case_id;
    if found and not exists (
      select 1 from public.case_events e
      where e.case_id = p_case_id
        and e.event_type = 'SMS_REPEATED'
        and e.created_at > now() - c_reply_window
    ) then
      insert into public.case_events (case_id, event_type, from_status, to_status, actor_role, metadata)
      values (p_case_id, 'SMS_REPEATED', v_status, v_status, 'GUEST', jsonb_build_object('channel', 'SMS'));
    end if;
  end if;

  v_reply := p_reply_kind is not null and (
    p_reply_kind = 'CREATED'
    or v_phone is null
    or not exists (
      select 1 from public.sms_inbound_messages o
      where o.phone = v_phone
        and o.id <> p_id
        and o.reply_kind <> 'CREATED'
        and o.replied_at > now() - c_reply_window
    )
  );

  if v_reply then
    update public.sms_inbound_messages m
    set reply_kind = p_reply_kind, replied_at = now()
    where m.id = p_id;
  end if;

  return v_reply;
end;
$$;

revoke all on function public.record_sms_inbound(text, text, text) from public, anon, authenticated;
revoke all on function public.finish_sms_inbound(uuid, text, uuid, double precision, double precision, text, text)
  from public, anon, authenticated;
grant execute on function public.record_sms_inbound(text, text, text) to service_role;
grant execute on function public.finish_sms_inbound(uuid, text, uuid, double precision, double precision, text, text)
  to service_role;

-- ----------------------------------------------------------------------------
-- 5. ล้างเบอร์และพิกัดของ SMS ที่เกิน 90 วัน (เก็บไว้แค่ผลและเวลา สำหรับสถิติ)
--    TODO(TF-44): ย้ายไปรวมกับงานล้างข้อมูลส่วนตัวทุกคืนของ TF-44 แล้วลบ cron job นี้
-- ----------------------------------------------------------------------------
create function public.purge_sms_inbound_pii()
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.sms_inbound_messages m
  set phone = null, lat = null, lng = null, pii_purged_at = now()
  where m.created_at < now() - interval '90 days'
    and m.pii_purged_at is null;
  get diagnostics v_count = row_count;

  if v_count > 0 then
    insert into public.audit_logs (action, target_type, metadata)
    values ('SMS_PII_PURGED', 'sms_inbound_messages', jsonb_build_object('rows', v_count));
  end if;

  return v_count;
end;
$$;

revoke all on function public.purge_sms_inbound_pii() from public, anon, authenticated;
grant execute on function public.purge_sms_inbound_pii() to service_role;

select cron.schedule('tf36-sms-inbound-retention', '40 3 * * *', 'select public.purge_sms_inbound_pii()');
