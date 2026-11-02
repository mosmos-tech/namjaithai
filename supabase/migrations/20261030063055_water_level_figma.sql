-- ============================================================================
-- แก้ TF-08 ให้ตรง Figma: ระดับน้ำ 5 ตัวเลือกใหม่ และไม่บังคับกรอก
--
-- เดิม (TF-04): ANKLE, KNEE, WAIST, CHEST, ROOF — บังคับกรอก
-- ใหม่ (Figma B1 · SOS step 1 "ระดับน้ำรอบตัวคุณตอนนี้"):
--   ROOF         บนหลังคา / ดาดฟ้า
--   FIRST_FLOOR  ท่วมชั้น 1 (อยู่ชั้น 2)
--   WAIST_CHEST  ระดับเอว–หน้าอก
--   ANKLE_KNEE   ระดับข้อเท้า–เข่า
--   SURROUNDED   ถูกน้ำล้อม / ตัดขาด
-- ไม่บังคับ เพราะฟอร์มบนมือถือ (Figma MB1) ไม่ได้ถามระดับน้ำ
--
-- Postgres ลบค่าออกจาก enum ไม่ได้ จึงสร้าง type ใหม่แล้วแปลงข้อมูลเดิม:
--   ANKLE, KNEE → ANKLE_KNEE · WAIST, CHEST → WAIST_CHEST · ROOF → ROOF
-- create_sos_case() อ้าง type ด้วยชื่อ public.water_level ตอนทำงาน จึงไม่ต้องแก้ฟังก์ชัน
-- ============================================================================

alter type public.water_level rename to water_level_old;

create type public.water_level as enum (
  'ROOF',         -- บนหลังคา / ดาดฟ้า
  'FIRST_FLOOR',  -- ท่วมชั้น 1 (อยู่ชั้น 2)
  'WAIST_CHEST',  -- ระดับเอว–หน้าอก
  'ANKLE_KNEE',   -- ระดับข้อเท้า–เข่า
  'SURROUNDED'    -- ถูกน้ำล้อม / ตัดขาด
);

alter table public.cases
  alter column water_level drop not null,
  alter column water_level type public.water_level using (
    case water_level::text
      when 'ANKLE' then 'ANKLE_KNEE'
      when 'KNEE' then 'ANKLE_KNEE'
      when 'WAIST' then 'WAIST_CHEST'
      when 'CHEST' then 'WAIST_CHEST'
      else water_level::text
    end
  )::public.water_level;

drop type public.water_level_old;

comment on column public.cases.water_level is
  'ระดับน้ำรอบตัวผู้แจ้ง (ไม่บังคับ — ฟอร์มมือถือไม่ได้ถาม) null = ไม่ได้ระบุ';
