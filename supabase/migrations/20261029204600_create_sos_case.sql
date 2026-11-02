-- ============================================================================
-- TF-12: API สร้างเคส SOS — ฝั่งฐานข้อมูล
--
-- ไฟล์นี้สร้าง:
--   1. case_code_counters    ตัวนับเลขรันรหัสเคสรายเดือน (FL-2610-0042)
--   2. sos_rate_limit_hits   บันทึกการส่ง เพื่อจำกัดจำนวนครั้งต่อเบอร์/IP
--   3. create_sos_case()     ฟังก์ชันบันทึกเคสลงทุกตารางใน transaction เดียว
--
-- ทำไมต้องเป็นฟังก์ชันในฐานข้อมูล:
--   ถ้าให้ API insert ทีละตาราง แล้วพังกลางทาง (เช่น insert cases ผ่าน แต่ case_people ล้ม)
--   จะเหลือเคสครึ่งๆ กลางๆ ในระบบ ฟังก์ชัน plpgsql ทำงานใน transaction เดียว
--   ถ้าขั้นไหนล้ม ทุกอย่างย้อนกลับหมด (all-or-nothing)
--
-- ใครเรียกได้: เฉพาะ service_role (เซิร์ฟเวอร์ Next.js ที่ถือ SUPABASE_SECRET_KEY)
--   คนทั่วไปที่มีแค่ publishable key เรียกตรงไม่ได้ ต้องผ่าน POST /api/cases เท่านั้น
--   เพื่อไม่ให้หลบ rate limit หรือส่ง priority_score ปลอมเข้ามาเอง
-- ============================================================================

set search_path = public, extensions;

-- ----------------------------------------------------------------------------
-- 1. ตัวนับเลขรันรหัสเคส แยกตามเดือน (period = 'YYMM' ตามเวลาไทย)
--    ใช้ตารางแทน sequence เพราะ:
--      - ต้องเริ่มนับ 1 ใหม่ทุกเดือน
--      - ถ้า transaction ล้ม ตัวนับย้อนกลับด้วย เลขไม่กระโดด
--      - insert ... on conflict do update ล็อกแถวให้เอง ส่งพร้อมกันก็ไม่ได้เลขซ้ำ
-- ----------------------------------------------------------------------------
create table public.case_code_counters (
  period text primary key check (period ~ '^\d{4}$'),
  last_value integer not null default 0 check (last_value >= 0)
);

comment on table public.case_code_counters is
  'เลขรันล่าสุดของรหัสเคสในแต่ละเดือน (YYMM ตามเวลาไทย) ใช้ออกรหัส FL-YYMM-NNNN';

-- ----------------------------------------------------------------------------
-- 2. บันทึกการส่ง SOS สำหรับจำกัดจำนวนครั้ง
--    bucket = 'phone:<sha256>' หรือ 'ip:<sha256>'
--    เก็บเป็น hash ไม่เก็บเบอร์/IP ตรงๆ เพื่อไม่ให้เป็นข้อมูลส่วนบุคคลค้างในตารางนี้
-- ----------------------------------------------------------------------------
create table public.sos_rate_limit_hits (
  id bigint generated always as identity primary key,
  bucket text not null,
  created_at timestamptz not null default now()
);

comment on table public.sos_rate_limit_hits is
  'ประวัติการส่ง SOS (hash ของเบอร์/IP) ใช้นับจำนวนครั้งในช่วงเวลาเพื่อกันสแปม';

create index idx_sos_rate_limit_hits_bucket_created
  on public.sos_rate_limit_hits (bucket, created_at desc);

-- เปิด RLS โดยไม่มี policy = anon/authenticated อ่านเขียนไม่ได้เลย (service_role ข้าม RLS)
alter table public.case_code_counters enable row level security;
alter table public.sos_rate_limit_hits enable row level security;

-- ----------------------------------------------------------------------------
-- 3. ฟังก์ชันสร้างเคส SOS
--
-- พารามิเตอร์:
--   p_idempotency_key   คีย์จากหัว Idempotency-Key ส่งซ้ำด้วยคีย์เดิมจะได้เคสเดิมกลับไป
--   p_payload           ข้อมูลฟอร์มที่ผ่าน sosSchema (Zod) แล้ว ในรูป JSON
--   p_priority_score    คะแนนจาก priorityScore() ใน src/lib/domain (ไม่คำนวณซ้ำใน SQL)
--   p_client_ip         IP ผู้ส่ง (ใช้นับ rate limit) ไม่บังคับ
--   p_reporter_user_id  users.id ของคนที่ล็อกอิน (TF-43) ไม่ล็อกอินส่ง null
--
-- ผลลัพธ์: 1 แถว พร้อม replayed = true ถ้าเป็นการส่งซ้ำด้วยคีย์เดิม
--
-- error ที่ตั้งใจโยน:
--   SOS29  ส่งถี่เกินกำหนด  (detail = 'phone' | 'ip', hint = จำนวนวินาทีที่ต้องรอ)
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
  replayed boolean
)
language plpgsql
set search_path = public, extensions
as $$
declare
  -- กติกา rate limit: ช่วงเวลา 1 ชั่วโมง
  -- เบอร์เดียวกันส่งได้ 5 เคส / IP เดียวกันส่งได้ 20 เคส (ศูนย์อพยพหลายคนอาจใช้เน็ตเดียวกัน)
  c_window constant interval := interval '1 hour';
  c_phone_limit constant integer := 5;
  c_ip_limit constant integer := 20;

  v_phone text := p_payload ->> 'phone';
  v_phone_bucket text;
  v_ip_bucket text;
  v_hits integer;
  v_oldest timestamptz;
  v_period text;
  v_seq integer;
  v_case public.cases%rowtype;
  v_constraint text;
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
    return query select v_case.id, v_case.case_code, v_case.tracking_token,
                        v_case.status, v_case.created_at, true;
    return;
  end if;

  -- (2) จำกัดจำนวนครั้งต่อเบอร์ / ต่อ IP
  v_phone_bucket := 'phone:' || encode(digest(v_phone, 'sha256'), 'hex');
  if p_client_ip is not null and btrim(p_client_ip) <> '' then
    v_ip_bucket := 'ip:' || encode(digest(btrim(p_client_ip), 'sha256'), 'hex');
  end if;

  -- ล้างประวัติเก่าที่พ้นช่วงเวลาแล้วของ bucket นี้ ไม่ให้ตารางโตไม่รู้จบ
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

  -- (3) บันทึกทุกตาราง — อยู่ใน block ย่อยเพื่อดักกรณีส่งพร้อมกันด้วยคีย์เดียวกัน
  begin
    -- ออกเลขรันของเดือนนี้ (เวลาไทย) เช่น 2610 = ต.ค. 2026
    v_period := to_char(now() at time zone 'Asia/Bangkok', 'YYMM');

    insert into public.case_code_counters as cc (period, last_value)
    values (v_period, 1)
    on conflict (period) do update set last_value = cc.last_value + 1
    returning cc.last_value into v_seq;

    insert into public.cases (
      case_code, idempotency_key, reporter_user_id, status,
      urgency, water_level, priority_score,
      lat, lng, accuracy_m,
      province, district, subdistrict, landmark, notes, source
    )
    values (
      -- lpad จะตัดเลขทิ้งถ้ายาวเกิน 4 หลัก เลยใช้เฉพาะตอนยังไม่ถึง 10000
      'FL-' || v_period || '-' || case when v_seq < 10000 then lpad(v_seq::text, 4, '0') else v_seq::text end,
      p_idempotency_key,
      p_reporter_user_id,
      'NEW',
      (p_payload ->> 'urgency')::public.urgency_level,
      (p_payload ->> 'waterLevel')::public.water_level,
      p_priority_score,
      (p_payload ->> 'lat')::double precision,
      (p_payload ->> 'lng')::double precision,
      (p_payload ->> 'accuracyM')::double precision,
      nullif(btrim(p_payload ->> 'province'), ''),
      nullif(btrim(p_payload ->> 'district'), ''),
      nullif(btrim(p_payload ->> 'subdistrict'), ''),
      p_payload ->> 'landmark',
      nullif(btrim(p_payload ->> 'notes'), ''),
      'WEB'
    )
    returning * into v_case;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'cases_idempotency_key_key' then
        -- อีกคำขอที่ใช้คีย์เดียวกันบันทึกเสร็จก่อนเรา → คืนเคสนั้นแทน
        select * into v_case from public.cases c where c.idempotency_key = p_idempotency_key;
        return query select v_case.id, v_case.case_code, v_case.tracking_token,
                            v_case.status, v_case.created_at, true;
        return;
      end if;
      raise;
  end;

  -- ข้อมูลติดต่อ (แยกตารางเพื่อให้ RLS ใน TF-18 จำกัดคนเห็นได้)
  insert into public.case_contacts (case_id, name, phone, phone_last4, line_id)
  values (
    v_case.id,
    p_payload ->> 'name',
    v_phone,
    right(v_phone, 4),
    nullif(btrim(p_payload ->> 'lineId'), '')
  );

  -- จำนวนผู้ติดค้าง
  insert into public.case_people (case_id, adults, elderly, bedridden, children, pets)
  values (
    v_case.id,
    coalesce((p_payload ->> 'adults')::integer, 0),
    coalesce((p_payload ->> 'elderly')::integer, 0),
    coalesce((p_payload ->> 'bedridden')::integer, 0),
    coalesce((p_payload ->> 'children')::integer, 0),
    coalesce((p_payload ->> 'pets')::integer, 0)
  );

  -- สิ่งที่ต้องการ (distinct กันเลือกซ้ำ, other_detail ใส่เฉพาะแถว OTHER)
  insert into public.case_needs (case_id, need, other_detail)
  select
    v_case.id,
    n.need::public.need_type,
    case when n.need = 'OTHER' then btrim(p_payload ->> 'otherDetail') end
  from (
    select distinct jsonb_array_elements_text(coalesce(p_payload -> 'needs', '[]'::jsonb)) as need
  ) n;

  -- ไทม์ไลน์แถวแรก: CREATED
  insert into public.case_events (case_id, event_type, from_status, to_status, actor_user_id, actor_role, metadata)
  values (
    v_case.id,
    'CREATED',
    null,
    'NEW',
    p_reporter_user_id,
    case when p_reporter_user_id is null then 'GUEST' else 'USER' end,
    jsonb_build_object('source', v_case.source, 'priority_score', p_priority_score)
  );

  -- นับการส่งครั้งนี้เข้า rate limit
  insert into public.sos_rate_limit_hits (bucket)
  select b from unnest(array[v_phone_bucket, v_ip_bucket]) as b where b is not null;

  return query select v_case.id, v_case.case_code, v_case.tracking_token,
                      v_case.status, v_case.created_at, false;
end;
$$;

comment on function public.create_sos_case(text, jsonb, integer, text, uuid) is
  'สร้างเคส SOS ลง cases, case_contacts, case_people, case_needs, case_events ใน transaction เดียว '
  'พร้อม Idempotency-Key และ rate limit ต่อเบอร์/IP (เรียกได้เฉพาะ service_role)';

-- Supabase ให้สิทธิ์ execute ฟังก์ชันใหม่กับ anon/authenticated อัตโนมัติ → ถอนออก
revoke all on function public.create_sos_case(text, jsonb, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.create_sos_case(text, jsonb, integer, text, uuid) to service_role;
