-- ============================================================================
-- TF-74: ส่ง SOS ซ้ำแล้วติดตัน + ปิดช่องโหว่ข้อมูลเคสเดิม
--   create_sos_case (signature เดิม — คัดจากเวอร์ชันล่าสุดในฐานข้อมูล TF-63 แก้เฉพาะ TF-74):
--   1. การตรวจเคสซ้ำไม่นับเคสตัวอย่าง (is_demo) ตามกติกา TF-70
--   2. pg_advisory_xact_lock ด้วย idempotency key — กดรัว/ส่งซ้ำได้ผลเดียว
--   3. key ที่เคยอัปเดตเคสเดิม/ส่งข้อมูลเพิ่มแล้ว คืนผลเดิม ไม่อัปเดตซ้ำ
--   4. "อัปเดตเคสเดิม" ได้เฉพาะเบอร์เดียวกัน (ใกล้กัน 50 ม. แต่คนละเบอร์ = SOS48)
--   5. เบอร์เดียวกันแต่ไม่มี token ยืนยันของเครื่องที่ส่งเคสเดิม (TF-58) → เก็บเป็นรายงานเพิ่มเติม
--      ไม่แก้ชื่อ/เบอร์/ตำแหน่ง/ข้อมูลเคสเดิม และไม่คืนรหัสเคส/ลิงก์ติดตาม
--   เนื้อหารายงานเพิ่มเติมเก็บใน case_reporter_supplements (อ่านได้เฉพาะทีมที่รับเคส + แอดมิน แบบ
--   case_sensitive_details) — case_events ทุกคนที่เห็นเคสอ่านได้ จึงเก็บแค่ว่ามีรายงานเพิ่ม ไม่มีเนื้อหา
-- ============================================================================

create table public.case_reporter_supplements (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete restrict,
  idempotency_key text not null unique,
  report jsonb not null,
  created_at timestamptz not null default now()
);
comment on table public.case_reporter_supplements is
  'TF-74 รายงานเพิ่มเติมจากเบอร์เดิมที่ส่งจากเครื่องอื่น (เพิ่มได้อย่างเดียว) — เห็นเฉพาะทีมที่รับเคสและแอดมิน';
alter table public.case_reporter_supplements enable row level security;
revoke all on public.case_reporter_supplements from public, anon, authenticated;
grant select on public.case_reporter_supplements to authenticated;
create policy "read supplements of accepted cases" on public.case_reporter_supplements
  for select to authenticated using (rls.can_see_case_sensitive(case_id));
create index case_reporter_supplements_case_idx on public.case_reporter_supplements (case_id);
create trigger case_reporter_supplements_append_only
  before update or delete on public.case_reporter_supplements
  for each row execute function public.prevent_append_only_mutation();

-- เครื่องนี้คือเครื่องที่ส่งเคสนั้นไหม: เทียบกับ token ยืนยันของ TF-58 (ตาราง rls.* อ่านตรงไม่ได้
-- create_sos_case รันด้วยสิทธิ์ของผู้เรียก (service_role) จึงเทียบผ่านฟังก์ชันนี้ ซึ่งคืนแค่ใช่/ไม่ใช่)
create function public.device_owns_case(p_case_id uuid, p_tokens text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from rls.case_confirmation_secrets s
    where s.case_id = p_case_id and s.secret = any(coalesce(p_tokens, '{}'::text[]))
  )
$$;
revoke all on function public.device_owns_case(uuid, text[]) from public, anon, authenticated;
grant execute on function public.device_owns_case(uuid, text[]) to service_role;

-- ค้น key เดิมของการอัปเดต/ส่งข้อมูลเพิ่ม (1.1) ได้เร็ว
create index case_events_duplicate_idempotency_idx on public.case_events ((metadata ->> 'idempotency_key'))
  where metadata ->> 'source' in ('DUPLICATE_CHECK_UPDATE', 'DUPLICATE_CHECK_SUPPLEMENT');

create or replace function public.create_sos_case(p_idempotency_key text, p_payload jsonb, p_priority_score integer, p_client_ip text DEFAULT NULL::text, p_reporter_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(case_id uuid, case_code text, tracking_token text, status case_status, created_at timestamp with time zone, replayed boolean, updated_existing boolean, is_potential_duplicate boolean, duplicate_of_case_id uuid, duplicate_of_case_code text, duplicate_distance_m double precision)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
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
  -- TF-74: token ยืนยันของเครื่องผู้แจ้ง (TF-58) ที่ส่งมาตอนเลือก "อัปเดตเคสเดิม" — ใช้เทียบอย่างเดียว ไม่บันทึก
  v_device_tokens text[] := array(
    select t from jsonb_array_elements_text(
      case when jsonb_typeof(p_payload -> 'deviceConfirmationTokens') = 'array'
        then p_payload -> 'deviceConfirmationTokens' else '[]'::jsonb end
    ) t
    limit 20
  );
  v_prior_event public.case_events%rowtype;
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

  -- TF-74: คำขอ key เดียวกันทำทีละคำขอ (กดรัว / เน็ตช้าแล้วส่งซ้ำ) — คำขอที่สองเห็นผลของคำขอแรกเสมอ
  perform pg_advisory_xact_lock(hashtextextended('create_sos_case:' || p_idempotency_key, 0));

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
      -- TF-74: ฟอร์มเว็บไม่ได้รหัส/ระยะของเคสเดิม (SMS ตอบรหัสกลับไปยังเบอร์เจ้าของเคสเท่านั้น)
      case when v_channel = 'SMS' then v_dup_code end,
      case when v_channel = 'SMS' then v_dup_dist_m end;
    return;
  end if;

  -- (1.1) TF-74: key นี้เคย "อัปเดตเคสเดิม" หรือ "ส่งข้อมูลเพิ่ม" ไปแล้ว → คืนผลเดิม ไม่อัปเดตซ้ำ
  select * into v_prior_event from public.case_events e
  where e.metadata ->> 'idempotency_key' = p_idempotency_key
    and e.metadata ->> 'source' in ('DUPLICATE_CHECK_UPDATE', 'DUPLICATE_CHECK_SUPPLEMENT')
  order by e.created_at
  limit 1;
  if found then
    select * into v_case from public.cases c where c.id = v_prior_event.case_id;
    -- ส่งข้อมูลเพิ่ม (เครื่องอื่น) ไม่คืนรหัสเคส/ลิงก์ติดตาม
    if v_prior_event.metadata ->> 'source' = 'DUPLICATE_CHECK_SUPPLEMENT' then
      return query select v_case.id, null::text, null::text, v_case.status, v_case.created_at,
        true, true, false, null::uuid, null::text, null::double precision;
    else
      return query select v_case.id, v_case.case_code, v_case.tracking_token, v_case.status,
        v_case.created_at, true, true, false, null::uuid, null::text, null::double precision;
    end if;
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
    -- TF-74 / TF-70: เคสตัวอย่างไม่นับเป็นเคสซ้ำ
    and not c.is_demo
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
            -- TF-74: ฟอร์มเว็บได้แค่ว่าพบเคสที่อาจซ้ำแบบไหน ไม่มีรหัส/ข้อมูลใดๆ ของเคสเดิม
            -- SMS (TF-36) ตอบรหัสเคสเดิมกลับไปยังเบอร์เดียวกันเท่านั้น จึงยังได้ข้อมูลเดิม
            detail = case when v_channel = 'SMS' then jsonb_build_object(
              'caseId', v_dup_case.id,
              'caseCode', v_dup_case.case_code,
              'status', v_dup_case.status,
              'incidentType', v_dup_case.incident_type,
              'waterLevel', v_dup_case.details ->> 'waterLevel',
              'createdAt', v_dup_case.created_at,
              'matchReason', v_match_reason,
              'distanceM', v_dup_dist_m
            ) else jsonb_build_object('matchReason', v_match_reason) end::text;
  end if;

  -- (3.2) TF-74: "อัปเดตเคสเดิม" ได้เฉพาะเบอร์เดียวกัน — เคสใกล้กันแต่คนละเบอร์เป็นของคนอื่น ห้ามแก้
  if v_dup_found and v_duplicate_action = 'UPDATE_EXISTING' and v_match_reason = 'NEARBY_50M' then
    raise exception 'only the same phone can update an existing case' using errcode = 'SOS48';
  end if;

  -- (3.3) TF-74: เบอร์เดียวกันแต่ไม่ใช่เครื่องที่ส่งเคสเดิม (ไม่มี token ยืนยันของเคสนั้น)
  -- → เก็บเป็นรายงานเพิ่มเติมให้ทีมที่รับเคส ไม่แก้ข้อมูลเคสเดิม และไม่คืนรหัสเคส/ลิงก์ติดตาม
  if v_dup_found and v_duplicate_action = 'UPDATE_EXISTING'
    and not public.device_owns_case(v_dup_case.id, v_device_tokens) then
    insert into public.case_reporter_supplements (case_id, idempotency_key, report)
    values (
      v_dup_case.id,
      p_idempotency_key,
      jsonb_strip_nulls(jsonb_build_object(
        'urgency', p_payload ->> 'urgency',
        'incidentType', v_incident_type,
        'waterLevel', nullif(btrim(p_payload ->> 'waterLevel'), ''),
        'canSelfEvacuate', p_payload -> 'canSelfEvacuate',
        'adults', (p_payload ->> 'adults')::integer,
        'elderly', (p_payload ->> 'elderly')::integer,
        'bedridden', (p_payload ->> 'bedridden')::integer,
        'children', (p_payload ->> 'children')::integer,
        'pets', (p_payload ->> 'pets')::integer,
        'needs', p_payload -> 'needs',
        'otherDetail', nullif(btrim(p_payload ->> 'otherDetail'), ''),
        'landmark', nullif(btrim(p_payload ->> 'landmark'), ''),
        'notes', nullif(btrim(p_payload ->> 'notes'), ''),
        'distanceM', round(ST_Distance(v_dup_case.location, v_point)::numeric)
      ))
    );

    insert into public.case_events (
      case_id, event_type, from_status, to_status, actor_user_id, actor_role, metadata
    )
    values (
      v_dup_case.id,
      'REPORTER_UPDATED',
      v_dup_case.status,
      v_dup_case.status,
      p_reporter_user_id,
      case when p_reporter_user_id is null then 'GUEST' else 'USER' end,
      jsonb_build_object(
        'source', 'DUPLICATE_CHECK_SUPPLEMENT',
        'idempotency_key', p_idempotency_key,
        'match_reason', v_match_reason
      )
    );

    insert into public.sos_rate_limit_hits (bucket)
    select b from unnest(array[v_phone_bucket, v_ip_bucket]) b where b is not null;

    return query select v_dup_case.id, null::text, null::text, v_dup_case.status,
      v_dup_case.created_at, false, true, false, null::uuid, null::text, null::double precision;
    return;
  end if;

  -- (3.4) ถ้าผู้แจ้งเลือก "อัปเดตเคสเดิม" จากเครื่องที่ส่งเคสเดิม (UPDATE_EXISTING)
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
      is_potential_duplicate, duplicate_of_case_id,
      reporter_locale
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
      case when v_dup_found then v_dup_case.id else null end,
      -- TF-63: ภาษาฟอร์มที่ผู้แจ้งใช้ (ค่าอื่น/ไม่ส่งมา = ไทย)
      case when p_payload ->> 'reporterLocale' = 'en' then 'en' else 'th' end
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
          -- TF-74: ฟอร์มเว็บไม่ได้รหัส/ระยะของเคสเดิม (SMS ตอบรหัสกลับไปยังเบอร์เจ้าของเคสเท่านั้น)
          case when v_channel = 'SMS' then v_dup_code end,
          case when v_channel = 'SMS' then v_dup_dist_m end;
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
    -- TF-74: ฟอร์มเว็บไม่ได้รหัส/ระยะของเคสเดิม (SMS ตอบรหัสกลับไปยังเบอร์เจ้าของเคสเท่านั้น)
    case when v_channel = 'SMS' then v_dup_code end,
    case when v_channel = 'SMS' then v_dup_dist_m end;
end;
$function$;
