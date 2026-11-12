-- ============================================================================
-- TF-42: หน้าติดตามของผู้แจ้งแบบแผนที่สด (แบบติดตามพัสดุ)
--   get_case_tracking (ตัวระบุเคสและ rate limit เดิม) คืนเพิ่ม:
--   - scene: พิกัดเคส เฉพาะ EN_ROUTE / ON_SITE
--   - teamLocation: {lat, lng, updatedAt, distanceM} ของคนที่รับเคสคนปัจจุบัน เฉพาะ EN_ROUTE / ON_SITE
--     ที่กำลังแชร์ (TF-28) และอัปเดตไม่เกิน 2 นาที — นอกนั้น null
--   ผู้แจ้งยังอ่าน rescuer_locations ตรงไม่ได้ (RLS ของ TF-28 เดิม) · ETA คำนวณฝั่งเว็บจาก distanceM
--   เนื้อหาฟังก์ชันคัดจากเวอร์ชันล่าสุด (TF-59) เพิ่มเฉพาะบรรทัดที่มีคอมเมนต์ TF-42 (grant เดิมคงอยู่)
-- ============================================================================

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
  v_live boolean;
  v_team_location jsonb;
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

  -- TF-42: ทีมกำลังมา/ถึงแล้ว → ตำแหน่งของ "คนที่รับเคสคนปัจจุบัน" (assigned_rescuer_id) เท่านั้น
  -- ไม่ใช้หน่วยหรือ active_case_id: เคสที่เพิ่งส่งต่อ (TF-59) จึงไม่หยิบตำแหน่งกู้ภัยของหน่วยเดิม
  -- ต้องกำลังแชร์และไม่เก่ากว่า 2 นาที (ตรงกับ TEAM_LOCATION_STALE_MS ใน src/lib/domain) — เก่ากว่านั้นไม่คืน
  -- คืนแค่พิกัด เวลา และระยะ ไม่มี user id ชื่อ หรือเบอร์ของกู้ภัย · เคสตัวอย่าง (TF-70) ไม่มีแผนที่
  v_live := v_case.status in ('EN_ROUTE', 'ON_SITE') and not v_case.is_demo;
  if v_live and v_case.assigned_rescuer_id is not null then
    select jsonb_build_object(
        'lat', r.lat,
        'lng', r.lng,
        'updatedAt', r.recorded_at,
        'distanceM', round(extensions.st_distance(r.location, v_case.location))::integer
      )
      into v_team_location
    from public.rescuer_locations r
    where r.user_id = v_case.assigned_rescuer_id
      and r.is_sharing
      and r.recorded_at > now() - interval '2 minutes';
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
    -- TF-42: จุดของผู้แจ้งบนแผนที่ ส่งเฉพาะตอนทีมกำลังมา/ถึงแล้ว (ช่วงอื่นไม่มีแผนที่ ไม่ต้องส่งพิกัด)
    'scene', case when v_live then jsonb_build_object('lat', v_case.lat, 'lng', v_case.lng) end,
    'teamLocation', v_team_location,
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
