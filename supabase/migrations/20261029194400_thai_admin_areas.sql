-- ============================================================================
-- TF-05: ข้อมูลจังหวัด/อำเภอ/ตำบล พร้อมขอบเขตพื้นที่
-- ตาราง 3 ตาราง: provinces, districts, subdistricts (รหัสตามกรมการปกครอง)
-- ฟังก์ชัน locate_admin_area(lat, lng): แปลงพิกัดเป็นจังหวัด/อำเภอ/ตำบล
-- ข้อมูลจริงอยู่ใน supabase/seeds/thai_admin_areas.sql (สร้างด้วย scripts/geo/build-seed.mjs)
-- ============================================================================

set search_path = public, extensions;

-- ----------------------------------------------------------------------------
-- 1. ตาราง
-- ขอบเขตใช้ geometry (ไม่ใช่ geography แบบ cases.location) เพราะเช็ก "จุดอยู่ในพื้นที่ไหน"
-- บน geometry เร็วกว่ามาก และพื้นที่ระดับตำบล/จังหวัดเล็กพอที่ไม่ต้องคิดความโค้งของโลก
-- ชื่อไทยใช้ collation ภาษาไทย ให้เรียง "เชียงใหม่" อยู่หมวด ช ไม่ใช่ไปต่อท้ายหลัง ฮ
-- ----------------------------------------------------------------------------

-- 1.1 จังหวัด (77 จังหวัด รหัส 2 หลัก เช่น 10 = กรุงเทพมหานคร)
create table public.provinces (
  code integer primary key,
  name_th text collate "th-TH-x-icu" not null,
  name_en text not null,
  geom geometry(MultiPolygon, 4326) not null
);

comment on table public.provinces is 'จังหวัด 77 จังหวัด รหัสตามกรมการปกครอง ขอบเขตย่อความละเอียดสำหรับแสดงบนแผนที่';

-- 1.2 อำเภอ/เขต (รหัส 4 หลัก เช่น 1001 = เขตพระนคร)
create table public.districts (
  code integer primary key,
  province_code integer not null references public.provinces(code),
  name_th text collate "th-TH-x-icu" not null,
  name_en text not null,
  geom geometry(MultiPolygon, 4326) not null
);

comment on table public.districts is 'อำเภอ/เขต รหัสตามกรมการปกครอง ขอบเขตย่อความละเอียดสำหรับแสดงบนแผนที่';

-- 1.3 ตำบล/แขวง (รหัส 6 หลัก เช่น 100101 = แขวงพระบรมมหาราชวัง)
-- เก็บ province_code ซ้ำไว้ด้วย จะได้ไม่ต้อง join อำเภอทุกครั้ง
create table public.subdistricts (
  code integer primary key,
  district_code integer not null references public.districts(code),
  province_code integer not null references public.provinces(code),
  name_th text collate "th-TH-x-icu" not null,
  name_en text not null,
  geom geometry(MultiPolygon, 4326) not null
);

comment on table public.subdistricts is 'ตำบล/แขวง รหัสตามกรมการปกครอง ขอบเขตคลาดจากต้นฉบับไม่เกิน 50 เมตร ใช้แปลงพิกัดเป็นที่อยู่';

-- ----------------------------------------------------------------------------
-- 2. Indexes
-- ----------------------------------------------------------------------------
create index idx_districts_province_code on public.districts (province_code);
create index idx_subdistricts_district_code on public.subdistricts (district_code);
create index idx_subdistricts_geom_gist on public.subdistricts using gist (geom);

-- ----------------------------------------------------------------------------
-- 3. แปลงพิกัดเป็นจังหวัด/อำเภอ/ตำบล
-- ถ้าจุดอยู่ในตำบลไหนก็ตอบตำบลนั้น (distance_m = 0)
-- ถ้าไม่อยู่ในตำบลใดเลย เช่น ริมทะเล/ปากแม่น้ำที่เส้นขอบไม่ครอบถึง ให้ตอบตำบลที่ใกล้ที่สุดในระยะ 2 กม.
-- ไกลกว่านั้นถือว่าอยู่นอกประเทศไทย ไม่ตอบอะไร
-- ----------------------------------------------------------------------------
create or replace function public.locate_admin_area(p_lat double precision, p_lng double precision)
returns table (
  subdistrict_code integer,
  subdistrict_name_th text,
  district_code integer,
  district_name_th text,
  province_code integer,
  province_name_th text,
  distance_m double precision
)
language sql
stable
set search_path = public, extensions
as $$
  with pt as (
    select ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326) as g
  ),
  inside as (
    select s.code, 0::double precision as distance_m
    from public.subdistricts s, pt
    where ST_Covers(s.geom, pt.g)
    limit 1
  ),
  -- <-> ใช้ spatial index หาตัวเลือกใกล้ๆ ก่อน แล้วค่อยวัดระยะจริงเป็นเมตร
  nearby as (
    select c.code, ST_Distance(c.geom::geography, pt.g::geography) as distance_m
    from (
      select s.code, s.geom
      from public.subdistricts s, pt
      where not exists (select 1 from inside)
      order by s.geom <-> pt.g
      limit 5
    ) c, pt
  ),
  best as (
    select code, distance_m from inside
    union all
    select code, distance_m from nearby where distance_m <= 2000
    order by distance_m
    limit 1
  )
  select s.code, s.name_th::text, d.code, d.name_th::text, p.code, p.name_th::text, best.distance_m
  from best
  join public.subdistricts s on s.code = best.code
  join public.districts d on d.code = s.district_code
  join public.provinces p on p.code = s.province_code;
$$;

comment on function public.locate_admin_area is 'แปลงพิกัด (lat, lng) เป็นตำบล/อำเภอ/จังหวัด ถ้าจุดไม่อยู่ในตำบลใดจะหาตำบลใกล้สุดในระยะ 2 กม.';

-- ----------------------------------------------------------------------------
-- 4. สิทธิ์: เป็นข้อมูลสาธารณะ ทุกคนอ่านได้ (รวมผู้ไม่ล็อกอินที่กด SOS) แต่แก้ไม่ได้
-- ----------------------------------------------------------------------------
alter table public.provinces enable row level security;
alter table public.districts enable row level security;
alter table public.subdistricts enable row level security;

create policy "anyone can read provinces" on public.provinces for select using (true);
create policy "anyone can read districts" on public.districts for select using (true);
create policy "anyone can read subdistricts" on public.subdistricts for select using (true);

revoke insert, update, delete, truncate on public.provinces, public.districts, public.subdistricts
  from anon, authenticated;
grant select on public.provinces, public.districts, public.subdistricts to anon, authenticated;
grant execute on function public.locate_admin_area(double precision, double precision)
  to anon, authenticated;
