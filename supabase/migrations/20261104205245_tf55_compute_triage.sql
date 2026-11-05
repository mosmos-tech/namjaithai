-- ============================================================================
-- TF-55: ระบบคำนวณความเร่งด่วน (computeTriage)
--
--   ผู้แจ้งไม่เลือกสีเอง: เซิร์ฟเวอร์คำนวณระดับด้วย computeTriage() (src/lib/domain/triage.ts)
--   แล้วส่ง urgency + triageReasons มาให้ create_sos_case() — ฐานข้อมูลไม่คำนวณซ้ำ
--
--   1. cases.triage_reasons   เหตุผลของระดับ (รหัส) แสดงเป็นแท็กให้กู้ภัย
--      เคสที่แจ้งก่อน TF-55 ได้ REPORTER_SELECTED (ผู้แจ้งเลือกสีเอง)
--   2. กู้ภัยปรับระดับ: system_urgency (ระดับที่ระบบคิด) + เหตุผล/คน/เวลาที่ปรับ
--      ผ่าน override_case_urgency() เท่านั้น บังคับเหตุผล และบันทึก audit_logs
--   3. คำตอบด้านสุขภาพ (สัญญาณอันตราย ผู้พิการ ผู้บาดเจ็บ) ลง case_sensitive_details
--      และเพิ่มเป็น key ต้องห้ามใน cases.details
--   4. ผู้แจ้งไม่เห็นระดับ: ตัด urgency ออกจากข้อมูลเคสซ้ำ (SOS49) และหน้าติดตามเคส
-- ============================================================================

set search_path = public, extensions;

-- ----------------------------------------------------------------------------
-- 1–2. คอลัมน์ใหม่ของ cases
-- ----------------------------------------------------------------------------
alter table public.cases
  add column triage_reasons text[] not null default '{}',
  add column system_urgency public.urgency_level,
  add column urgency_override_reason text
    check (urgency_override_reason is null or char_length(btrim(urgency_override_reason)) between 5 and 300),
  add column urgency_overridden_by uuid references public.users (id) on delete set null,
  add column urgency_overridden_at timestamptz;

update public.cases set triage_reasons = array['REPORTER_SELECTED'] where triage_reasons = '{}';

comment on column public.cases.triage_reasons is
  'เหตุผลของระดับความเร่งด่วน (รหัสจาก TriageReason ใน src/lib/domain/triage.ts)';
comment on column public.cases.system_urgency is
  'ระดับที่ระบบคำนวณไว้ก่อนกู้ภัยปรับ (null = ยังไม่มีใครปรับ)';

-- ----------------------------------------------------------------------------
-- 3. key ต้องห้ามใน cases.details (ตรงกับ FORBIDDEN_DETAIL_KEYS ในโค้ด)
-- ----------------------------------------------------------------------------
alter table public.cases drop constraint cases_details_no_personal_data;
alter table public.cases
  add constraint cases_details_no_personal_data
    check (not (details ?| array['name', 'phone', 'lineId', 'detailedAddress', 'health', 'dangerSigns', 'hasDisabled', 'hasInjured']));

-- ----------------------------------------------------------------------------
-- 2. กู้ภัยปรับระดับ
--    ปรับได้: แอดมิน / กู้ภัยที่รับเคส / หัวหน้าของหน่วยที่รับเคส
--    p_priority_score คำนวณใน TypeScript ด้วย priorityScore() (ไม่เขียนสูตรซ้ำในฐานข้อมูล)
--    p_expected_version กันทับการแก้ของคนอื่น (optimistic lock)
-- ----------------------------------------------------------------------------
create or replace function public.override_case_urgency(
  p_case_id uuid,
  p_urgency public.urgency_level,
  p_reason text,
  p_priority_score integer,
  p_expected_version integer
)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user uuid := rls.current_user_id();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_case public.cases%rowtype;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if char_length(v_reason) < 5 or char_length(v_reason) > 300 then
    raise exception 'reason must be 5-300 characters' using errcode = '22023';
  end if;

  select * into v_case from public.cases c where c.id = p_case_id for update;
  if not found then
    raise exception 'case not found' using errcode = 'P0002';
  end if;

  if not (
    rls.is_admin()
    or v_case.assigned_rescuer_id = v_user
    or v_case.assigned_unit_id in (select rls.my_unit_ids(true))
  ) then
    raise exception 'not allowed to change urgency of this case' using errcode = '42501';
  end if;

  if v_case.status not in ('NEW', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE') then
    raise exception 'case is closed' using errcode = 'SOS40';
  end if;
  if v_case.version <> p_expected_version then
    raise exception 'version conflict' using errcode = 'SOS41';
  end if;
  if v_case.urgency = p_urgency then
    raise exception 'urgency unchanged' using errcode = '22023';
  end if;

  update public.cases
  set system_urgency = coalesce(system_urgency, urgency),
      urgency = p_urgency,
      priority_score = p_priority_score,
      urgency_override_reason = v_reason,
      urgency_overridden_by = v_user,
      urgency_overridden_at = now(),
      version = version + 1
  where id = p_case_id;

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, case_id, metadata)
  values (
    v_user, 'CASE_URGENCY_OVERRIDDEN', 'case', p_case_id, p_case_id,
    jsonb_build_object(
      'from', v_case.urgency,
      'to', p_urgency,
      'systemUrgency', coalesce(v_case.system_urgency, v_case.urgency),
      'reason', v_reason
    )
  );

  return v_case.version + 1;
end;
$$;

revoke all on function public.override_case_urgency(uuid, public.urgency_level, text, integer, integer)
  from public, anon;
grant execute on function public.override_case_urgency(uuid, public.urgency_level, text, integer, integer)
  to authenticated;

-- ----------------------------------------------------------------------------
-- 3–4. create_sos_case(): คัดลอกจาก TF-49 (20261104201201) แก้เฉพาะ
--      - เขียน triage_reasons, details.canSelfEvacuate และ case_sensitive_details
--      - อัปเดตเคสเดิม: ใช้ระดับใหม่ ล้างการปรับของกู้ภัย แทนคำตอบด้านสุขภาพชุดเดิม
--      - ตัด urgency ออกจากข้อมูลเคสซ้ำ (SOS49) ที่ส่งกลับไปให้ผู้แจ้ง
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
  -- TF-55: เหตุผลของระดับที่ระบบคำนวณ และคำตอบด้านสุขภาพ (ไป case_sensitive_details)
  v_triage_reasons text[] := array(
    select jsonb_array_elements_text(coalesce(p_payload -> 'triageReasons', '[]'::jsonb))
  );
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
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'idempotency key is required' using errcode = '22023';
  end if;

  if v_phone is null or v_phone !~ '^\d{9,10}$' then
    raise exception 'payload.phone must be 9-10 digits' using errcode = '22023';
  end if;

  if cardinality(v_triage_reasons) = 0 then
    raise exception 'payload.triageReasons is required' using errcode = '22023';
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
        -- TF-55: ผู้แจ้งตอบใหม่ = ระบบคำนวณใหม่ ล้างการปรับระดับของกู้ภัยครั้งก่อน
        triage_reasons = v_triage_reasons,
        system_urgency = null,
        urgency_override_reason = null,
        urgency_overridden_by = null,
        urgency_overridden_at = null,
        -- ส่งระดับน้ำมาใหม่ก็ทับค่าเดิม ไม่ส่งมาก็คงค่าเดิมไว้
        details = c.details || jsonb_strip_nulls(jsonb_build_object(
          'waterLevel', nullif(btrim(p_payload ->> 'waterLevel'), ''),
          'canSelfEvacuate', p_payload -> 'canSelfEvacuate'
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

    -- คำตอบด้านสุขภาพชุดใหม่แทนชุดเดิมทั้งหมด (ไม่มีแล้ว = ลบแถวทิ้ง)
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
      urgency, triage_reasons, incident_type, details, priority_score,
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
      v_triage_reasons,
      v_incident_type,
      jsonb_strip_nulls(jsonb_build_object(
        'waterLevel', nullif(btrim(p_payload ->> 'waterLevel'), ''),
        'canSelfEvacuate', p_payload -> 'canSelfEvacuate'
      )),
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

  if v_sensitive is not null then
    insert into public.case_sensitive_details (case_id, details) values (v_case.id, v_sensitive);
  end if;

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

-- ----------------------------------------------------------------------------
-- 4. get_case_tracking(): คัดลอกจาก TF-13 (20261030014727) ตัด urgency ออก
--    ผู้แจ้งไม่ต้องเห็นระดับ แม้จะเปิด DevTools ดูข้อมูลที่ส่งมา
-- ----------------------------------------------------------------------------
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
          where cc.case_id = c.id and cc.phone_last4 = p_phone_last4
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
