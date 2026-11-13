-- ============================================================================
-- TF-38: แอดมิน export รายการเคสเป็น CSV ด้วยตัวกรองเดียวกับสถิติห้องสั่งการ (TF-33)
--   1. admin_case_statistics รับตัวกรองประเภทเหตุเพิ่ม (p_incident_type)
--      ไม่แก้ไฟล์ migration ของ TF-33 (ลงบน dev แล้ว) — drop ตัวเก่า 3 พารามิเตอร์ก่อน ไม่งั้นได้สองฟังก์ชันชื่อซ้ำ
--      เรียกแบบ 3 พารามิเตอร์เดิมยังได้ผลเหมือนเดิม (p_incident_type มีค่าเริ่มต้น null)
--   2. admin_case_export: คืนเฉพาะคอลัมน์ที่อนุญาต (ไม่มีชื่อ เบอร์ พิกัด ที่อยู่ ข้อความที่ผู้แจ้งพิมพ์
--      case_sensitive_details หรือ user id ของกู้ภัย) ไม่รวมเคสตัวอย่าง (TF-70)
--      มีภาษาที่ผู้แจ้งใช้ (TF-63 reporter_locale) · บังคับช่วงวันที่ไม่เกิน 366 วัน และเขียน audit_logs ทุกครั้ง (ใคร เมื่อไร ตัวกรอง จำนวนแถว)
-- ============================================================================

drop function public.admin_case_statistics(text, date, date);

create function public.admin_case_statistics(
  p_province text default null,
  p_from date default null,
  p_to date default null,
  p_incident_type text default null
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not coalesce(rls.is_admin(), false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception 'invalid date range' using errcode = '22023';
  end if;
  with relevant as (
    select c.status, c.urgency, c.incident_type, c.province, c.created_at, c.closed_at
    from public.cases c where not c.is_demo and (nullif(p_province, '') is null or c.province = p_province)
      -- TF-38: ตัวกรองประเภทเหตุ (ชุดเดียวกับ CSV)
      and (nullif(p_incident_type, '') is null or c.incident_type = p_incident_type)
  ), period as (
    select * from relevant c
    where (p_from is null or c.created_at >= (p_from::timestamp at time zone 'Asia/Bangkok'))
      and (p_to is null or c.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Bangkok'))
  )
  select pg_catalog.jsonb_build_object(
    'open', (select count(*) from relevant where status in ('NEW','ACCEPTED','EN_ROUTE','ON_SITE','AWAITING_CONFIRMATION')),
    'critical_waiting', (select count(*) from relevant where status = 'NEW' and urgency = 'RED'),
    'helping', (select count(*) from relevant where status in ('ACCEPTED','EN_ROUTE','ON_SITE')),
    'closed_today', (select count(*) from relevant where status in ('RESOLVED','CANCELLED','DUPLICATE','UNREACHABLE') and (closed_at at time zone 'Asia/Bangkok')::date = (now() at time zone 'Asia/Bangkok')::date),
    'urgencies', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', n) order by name) from (select urgency::text name, count(*) n from period group by urgency) s), '[]'::jsonb),
    'provinces', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', n) order by name) from (select coalesce(province, 'ไม่ระบุ') name, count(*) n from period group by province) s), '[]'::jsonb),
    'incidents', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', n) order by name) from (select incident_type::text name, count(*) n from period group by incident_type) s), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.admin_case_statistics(text, date, date, text) from public, anon;
grant execute on function public.admin_case_statistics(text, date, date, text) to authenticated;

-- ----------------------------------------------------------------------------
-- export: เลือกคอลัมน์ทีละตัว (ไม่ select * แล้วตัดทีหลัง) — เพิ่มคอลัมน์ต้องผ่านการตรวจความเป็นส่วนตัว
-- ----------------------------------------------------------------------------
create function public.admin_case_export(
  p_from date,
  p_to date,
  p_province text default null,
  p_incident_type text default null
)
returns table (
  case_code text,
  created_at timestamptz,
  incident_type text,
  urgency public.urgency_level,
  status public.case_status,
  province text,
  district text,
  subdistrict text,
  unit_name text,
  closed_at timestamptz,
  close_confirmation text,
  reporter_locale text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_max_days constant integer := 366;
  v_actor uuid := rls.current_user_id();
  v_rows integer;
begin
  if v_actor is null or not coalesce(rls.is_admin(), false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'invalid date range' using errcode = '22023';
  end if;
  -- นับรวมวันแรกและวันสุดท้าย: 1 ม.ค.–31 ธ.ค. ปีอธิกสุรทิน = 366 วัน
  if p_to - p_from + 1 > c_max_days then
    raise exception 'date range too long' using errcode = '22023';
  end if;

  return query
    select c.case_code, c.created_at, c.incident_type, c.urgency, c.status,
      c.province, c.district, c.subdistrict, un.name, c.closed_at, c.close_confirmation,
      c.reporter_locale
    from public.cases c
    left join public.units un on un.id = c.assigned_unit_id
    where not c.is_demo
      and c.created_at >= (p_from::timestamp at time zone 'Asia/Bangkok')
      and c.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Bangkok')
      and (nullif(p_province, '') is null or c.province = p_province)
      and (nullif(p_incident_type, '') is null or c.incident_type = p_incident_type)
    order by c.created_at, c.case_code;
  get diagnostics v_rows = row_count;

  insert into public.audit_logs (actor_user_id, action, target_type, metadata)
  values (
    v_actor, 'CASES_EXPORTED', 'case_export',
    jsonb_build_object(
      'from', p_from, 'to', p_to,
      'province', nullif(p_province, ''),
      'incidentType', nullif(p_incident_type, ''),
      'rowCount', v_rows
    )
  );
end;
$$;
revoke all on function public.admin_case_export(date, date, text, text) from public, anon;
grant execute on function public.admin_case_export(date, date, text, text) to authenticated;
