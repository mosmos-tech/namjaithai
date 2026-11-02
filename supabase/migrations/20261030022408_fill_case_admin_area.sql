-- ============================================================================
-- แก้หลังรีวิว (TF-12): เติมจังหวัด/อำเภอ/ตำบลของเคสจากพิกัดอัตโนมัติ
--
-- ปัญหา: ฟอร์ม SOS ไม่บังคับเลือกจังหวัด (ตอนออฟไลน์เลือกไม่ได้) และ create_sos_case()
--   ไม่ได้เติมให้ เคสจึงมี province ว่าง กู้ภัย/แอดมินกรองเคสตามจังหวัดไม่ได้
--   (idx_cases_province_status ใน TF-04 ก็ใช้ไม่ได้)
--
-- ทำเป็น trigger แทนการแก้ create_sos_case() เพื่อให้ทุกทางที่สร้างเคส
--   (เว็บ, ส่งตอนออฟไลน์ TF-15, SMS) ได้จังหวัดเหมือนกัน
--
-- กติกา: เติมเฉพาะตอนผู้แจ้งไม่ได้ส่งทั้ง 3 ช่องมาเลย
--   ถ้าผู้แจ้งเลือกเองมาบางช่อง ให้เชื่อผู้แจ้ง ไม่เติมปน จะได้ไม่ได้ที่อยู่ที่ขัดกันเอง
-- ============================================================================

set search_path = public, extensions;

create or replace function public.fill_case_admin_area()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
declare
  v_area record;
begin
  if new.province is not null or new.district is not null or new.subdistrict is not null then
    return new;
  end if;

  -- trigger ทำงานเรียงตามชื่อ ตัวนี้อาจรันก่อน sync_geography_point
  -- เลยรองรับทั้งกรณีส่ง lat/lng หรือส่ง location มาอย่างเดียว
  select * into v_area
  from public.locate_admin_area(
    coalesce(new.lat, ST_Y(new.location::geometry)),
    coalesce(new.lng, ST_X(new.location::geometry))
  );

  -- พิกัดนอกประเทศไทย (ไกลจากเส้นขอบเกิน 2 กม.) ปล่อยว่างไว้
  if found then
    new.province := v_area.province_name_th;
    new.district := v_area.district_name_th;
    new.subdistrict := v_area.subdistrict_name_th;
  end if;

  return new;
end;
$$;

comment on function public.fill_case_admin_area() is
  'เติม province/district/subdistrict ของเคสจากพิกัด เมื่อผู้แจ้งไม่ได้ระบุมาทั้ง 3 ช่อง';

create trigger trg_cases_fill_admin_area
  before insert on public.cases
  for each row execute function public.fill_case_admin_area();

-- เติมให้เคสเก่าที่สร้างไปก่อนมี trigger นี้
update public.cases c
set province = a.province_name_th,
    district = a.district_name_th,
    subdistrict = a.subdistrict_name_th
from public.cases src
cross join lateral public.locate_admin_area(src.lat, src.lng) a
where c.id = src.id
  and c.province is null and c.district is null and c.subdistrict is null;
