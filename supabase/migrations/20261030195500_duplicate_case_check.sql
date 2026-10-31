-- ============================================================================
-- TF-16: ตรวจเคสซ้ำ (Duplicate Case Detection & Resolution)
--
-- กติกาโดเมน (docs/backlog.md · TF-16):
--   ตอนสร้างเคส ถ้าเบอร์เดียวกันมีเคสเปิดอยู่ หรือมีเคสห่างไม่ถึง 50 ม. ภายใน 24 ชม.
--   ให้ถามผู้แจ้งว่าเป็นการอัปเดตเคสเดิมหรือไม่:
--     1. ถ้าผู้แจ้งยังไม่ได้เลือก (duplicateAction = 'ASK' หรือไม่ได้ส่งมา):
--        โยนรหัส SOS49 พร้อมข้อมูลเคสที่พบ เพื่อให้หน้าเว็บแสดงตัวเลือก
--        "อัปเดตเคสเดิม" (UPDATE_EXISTING) หรือ "สร้างใหม่" (CREATE_NEW)
--     2. ถ้าผู้แจ้งเลือก "อัปเดตเคสเดิม" (duplicateAction = 'UPDATE_EXISTING'):
--        อัปเดตข้อมูลเคสเดิม คำนวณคะแนนความเร่งด่วนใหม่ และบันทึก case_events = REPORTER_UPDATED
--     3. ถ้าผู้แจ้งเลือก "สร้างใหม่" (duplicateAction = 'CREATE_NEW'):
--        สร้างเคสใหม่พร้อมทำเครื่องหมาย is_potential_duplicate = true
--        และชี้ duplicate_of_case_id ไปยังเคสที่อยู่ใกล้กัน/เบอร์เดียวกัน เพื่อให้แอดมินเห็น
-- ============================================================================

set search_path = public, extensions;

drop function if exists public.create_sos_case(text, jsonb, integer, text, uuid);

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

  select
    c.*,
    exists (
      select 1 from public.case_contacts cc
      where cc.case_id = c.id and cc.phone = v_phone
    ) as same_phone,
    (
      c.created_at >= now() - c_dup_window
      and ST_DWithin(c.location, v_point, c_dup_distance_m)
      and ST_Distance(c.location, v_point) < c_dup_distance_m
    ) as nearby_50m,
    round(ST_Distance(c.location, v_point)::numeric, 1)::double precision as dist_m
  into
    v_dup_case.id,
    v_dup_case.case_code,
    v_dup_case.tracking_token,
    v_dup_case.idempotency_key,
    v_dup_case.reporter_user_id,
    v_dup_case.status,
    v_dup_case.urgency,
    v_dup_case.water_level,
    v_dup_case.priority_score,
    v_dup_case.location,
    v_dup_case.lat,
    v_dup_case.lng,
    v_dup_case.accuracy_m,
    v_dup_case.province,
    v_dup_case.district,
    v_dup_case.subdistrict,
    v_dup_case.landmark,
    v_dup_case.notes,
    v_dup_case.source,
    v_dup_case.assigned_unit_id,
    v_dup_case.assigned_rescuer_id,
    v_dup_case.version,
    v_dup_case.duplicate_of_case_id,
    v_dup_case.is_potential_duplicate,
    v_dup_case.rescued_count,
    v_dup_case.resolution_note,
    v_dup_case.accepted_at,
    v_dup_case.resolved_at,
    v_dup_case.closed_at,
    v_dup_case.last_status_updated_at,
    v_dup_case.created_at,
    v_dup_case.updated_at,
    v_dup_same_phone,
    v_dup_nearby,
    v_dup_dist_m
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
              'waterLevel', v_dup_case.water_level,
              'createdAt', v_dup_case.created_at,
              'matchReason', v_match_reason,
              'distanceM', v_dup_dist_m
            )::text;
  end if;

  -- (3.2) ถ้าผู้แจ้งเลือก "อัปเดตเคสเดิม" (UPDATE_EXISTING) และเคสเดิมยังเปิดอยู่
  if v_dup_found and v_duplicate_action = 'UPDATE_EXISTING' then
    update public.cases c
    set urgency = (p_payload ->> 'urgency')::public.urgency_level,
        water_level = coalesce(
          nullif(btrim(p_payload ->> 'waterLevel'), '')::public.water_level,
          c.water_level
        ),
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
      urgency, water_level, priority_score,
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
      nullif(btrim(p_payload ->> 'waterLevel'), '')::public.water_level,
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
