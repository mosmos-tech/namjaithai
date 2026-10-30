-- ============================================================================
-- TF-13: หน้าติดตามเคส — ฝั่งฐานข้อมูล
--
-- get_case_tracking() คืนข้อมูลเคสที่ผู้แจ้ง/ญาติดูได้ ถ้ายืนยันตัวตนผ่านทางใดทางหนึ่ง:
--   - รหัสเคส + เบอร์ 4 ตัวท้าย  (พิมพ์เองที่หน้า /track)
--   - รหัสเคส + tracking token   (ลิงก์ที่แชร์ทาง LINE / หน้าส่งสำเร็จ)
--
-- ความเป็นส่วนตัว: คืนเฉพาะสถานะ ไทม์ไลน์ ตำบล/อำเภอ/จังหวัด และชื่อ/เบอร์ของหน่วยกู้ภัย
--   ไม่คืนชื่อ เบอร์ จุดสังเกต หรือพิกัดของผู้แจ้ง และไม่คืน note ในไทม์ไลน์ (อาจมีข้อมูลส่วนตัว)
--
-- กันเดา 4 ตัวท้าย: รหัสเคสเรียงเลขต่อกัน 4 ตัวท้ายมีแค่ 10,000 แบบ
--   เลยจำกัด IP ละ 10 ครั้งที่ผิดใน 15 นาที (นับเฉพาะครั้งที่ผิด และเฉพาะทาง 4 ตัวท้าย)
--   error SOS29 เหมือน create_sos_case (hint = จำนวนวินาทีที่ต้องรอ)
--
-- ใครเรียกได้: เฉพาะ service_role ผ่าน /api/track (เหมือน create_sos_case ใน TF-12)
-- ============================================================================

set search_path = public, extensions;

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
    'urgency', v_case.urgency,
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
