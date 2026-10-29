-- ============================================================================
-- TF-04: Schema ฐานข้อมูลหลัก (น้ำใจไทย SOS / ThaiFlood SOS)
-- ตารางหลัก 12 ตาราง:
--   users, units, unit_members, invites,
--   cases, case_contacts, case_people, case_needs, case_media, case_events,
--   rescuer_locations, audit_logs
-- พร้อม Enums, PostGIS (geography(Point) + GIST spatial index)
-- และ Trigger บังคับให้ case_events และ audit_logs แก้ไข/ลบไม่ได้ (Append-Only)
-- ============================================================================

set search_path = public, extensions;

-- ----------------------------------------------------------------------------
-- 1. เปิดใช้งาน Extensions ที่จำเป็น
-- ----------------------------------------------------------------------------
create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ----------------------------------------------------------------------------
-- 2. สร้าง Enums ตามกติกาโดเมน (ตรงกับ src/lib/domain/*)
-- ----------------------------------------------------------------------------

-- บทบาทผู้ใช้ในระบบ (สำหรับผู้ที่เข้าสู่ระบบ)
create type public.user_role as enum (
  'USER',       -- ผู้ใช้ทั่วไป (ล็อกอิน LINE)
  'RESCUER',    -- กู้ภัย
  'UNIT_LEAD',  -- หัวหน้าหน่วยกู้ภัย
  'ADMIN'       -- แอดมิน
);

-- สถานะบัญชีผู้ใช้
create type public.user_status as enum (
  'ACTIVE',     -- ใช้งานได้ปกติ
  'PENDING',    -- รอการอนุมัติ
  'SUSPENDED',  -- ถูกระงับสิทธิ์
  'REJECTED'    -- ถูกปฏิเสธคำขอ
);

-- สถานะการเป็นสมาชิกในหน่วยกู้ภัย
create type public.unit_member_status as enum (
  'PENDING',    -- สมัครผ่านลิงก์ LINE รอหัวหน้าหน่วยอนุมัติ
  'APPROVED',   -- อนุมัติแล้ว (มีอายุสิทธิ์ 90 วัน)
  'REJECTED',   -- ปฏิเสธคำขอ
  'SUSPENDED'   -- ถูกระงับสิทธิ์
);

-- สถานะการปฏิบัติงานของกู้ภัย (แสดงในหน้า /unit)
create type public.rescuer_duty_status as enum (
  'AVAILABLE',  -- ว่าง
  'EN_ROUTE',   -- กำลังเดินทาง
  'ON_SITE',    -- ถึงจุดเกิดเหตุ
  'OFFLINE'     -- ออฟไลน์
);

-- ระดับความเร่งด่วน (RED > YELLOW > GREEN)
create type public.urgency_level as enum (
  'RED',        -- วิกฤต
  'YELLOW',     -- เร่งด่วน
  'GREEN'       -- ทั่วไป
);

-- ระดับน้ำ 5 ระดับ (เรียงจากน้อยไปมาก)
create type public.water_level as enum (
  'ANKLE',      -- ถึงข้อเท้า
  'KNEE',       -- ถึงเข่า
  'WAIST',      -- ถึงเอว
  'CHEST',      -- ถึงอก
  'ROOF'        -- ท่วมถึงหลังคา
);

-- สิ่งที่ผู้ประสบภัยต้องการ (10 รายการหลัก + อื่นๆ พิมพ์เอง)
create type public.need_type as enum (
  'EVACUATION_BOAT',     -- เรืออพยพด่วน
  'EVACUATE_BEDRIDDEN',  -- อพยพผู้ป่วยติดเตียง/คนชรา
  'DRINKING_WATER',      -- น้ำดื่มสะอาด
  'FOOD',                -- อาหาร/ข้าวกล่อง
  'MEDICINE',            -- ยารักษาโรค/ปฐมพยาบาล
  'BABY_SUPPLIES',       -- ผ้าอ้อม/นมผง
  'FLASHLIGHT_POWER',    -- ไฟฉาย/พาวเวอร์แบงก์
  'LIFE_JACKET',         -- เสื้อชูชีพ/เชือก
  'PET_FOOD',            -- อาหารสัตว์เลี้ยง
  'CUT_POWER',           -- ตัดไฟด่วน (ไฟรั่ว)
  'OTHER'                -- อื่นๆ (พิมพ์เอง)
);

-- สถานะของเคส SOS
create type public.case_status as enum (
  'NEW',          -- เพิ่งแจ้ง รอทีมรับเคส
  'ACCEPTED',     -- ทีมรับเคสแล้ว
  'EN_ROUTE',     -- กำลังเดินทางไปช่วยเหลือ
  'ON_SITE',      -- ถึงจุดเกิดเหตุแล้ว
  'RESOLVED',     -- ช่วยเหลือสำเร็จ (ปิดเคส)
  'CANCELLED',    -- ยกเลิก / ผู้แจ้งกดปลอดภัยแล้ว (ปิดเคส)
  'DUPLICATE',    -- เคสซ้ำ (ปิดเคส)
  'UNREACHABLE'   -- ติดต่อไม่ได้ / เข้าไม่ถึง (ปิดเคส)
);

-- ประเภทเหตุการณ์ในไทม์ไลน์ของเคส (case_events)
create type public.case_event_type as enum (
  'CREATED',             -- สร้างเคสใหม่
  'ACCEPTED',            -- กู้ภัยกดรับเคส
  'RELEASED',            -- ปล่อยเคสกลับเป็น NEW
  'ASSIGNED',            -- หัวหน้าหน่วยหรือแอดมินมอบหมายเคส
  'STATUS_CHANGED',      -- เปลี่ยนสถานะเคส (EN_ROUTE / ON_SITE / RESOLVED)
  'REPORTER_UPDATED',    -- ผู้แจ้งอัปเดตข้อมูลเคส (ระดับน้ำ/จำนวนคน/โน้ต)
  'CANCELLED',           -- ยกเลิกเคส / ผู้แจ้งกดปลอดภัยแล้ว
  'MERGED_DUPLICATE',    -- รวมเคสซ้ำเข้ากับเคสหลัก
  'MARKED_UNREACHABLE',  -- ปิดเคสเนื่องจากติดต่อไม่ได้/เข้าไม่ถึง
  'AUTO_ESCALATED',      -- ระบบแจ้งเตือนเคสค้างอัตโนมัติ / คืนเคสเป็น NEW
  'NOTE_ADDED'           -- เพิ่มบันทึกข้อความเพิ่มเติม
);

-- ----------------------------------------------------------------------------
-- 3. ฟังก์ชันช่วย (Trigger Functions)
-- ----------------------------------------------------------------------------

-- 3.1 อัปเดตคอลัมน์ updated_at อัตโนมัติทุกครั้งที่มีการแก้ไขแถว
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 3.2 ซิงก์ค่า lat/lng กับ location (geography(Point, 4326)) อัตโนมัติ
-- ช่วยให้ทั้งกรณีส่ง lat/lng มาอย่างเดียว หรือส่ง location มาอย่างเดียว ข้อมูลตรงกันเสมอ
create or replace function public.sync_geography_point()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if new.lat is not null and new.lng is not null then
    if tg_op = 'INSERT'
       or new.location is null
       or new.lat is distinct from old.lat
       or new.lng is distinct from old.lng then
      new.location := ST_SetSRID(ST_MakePoint(new.lng, new.lat), 4326)::geography;
    end if;
  elsif new.location is not null then
    new.lat := ST_Y(new.location::geometry);
    new.lng := ST_X(new.location::geometry);
  end if;
  return new;
end;
$$;

-- 3.3 ป้องกันการแก้ไข (UPDATE) หรือลบ (DELETE) ในตารางแบบเพิ่มได้อย่างเดียว (Append-Only)
-- ใช้กับตาราง case_events และ audit_logs ตามเกณฑ์ผ่าน TF-04 และกติกาโดเมน
create or replace function public.prevent_append_only_mutation()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  raise exception 'Table %.% is append-only: % operation is not allowed',
    tg_table_schema, tg_table_name, tg_op
    using errcode = '42501';
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. ตารางระบบผู้ใช้และหน่วยกู้ภัย (users, units, invites, unit_members)
-- ----------------------------------------------------------------------------

-- 4.1 ตาราง users: ข้อมูลผู้ใช้ที่เข้าสู่ระบบผ่าน LINE
create table public.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  line_user_id text unique,
  display_name text not null,
  avatar_url text,
  phone text,
  role public.user_role not null default 'USER',
  status public.user_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.users is 'ข้อมูลผู้ใช้ที่เข้าสู่ระบบด้วย LINE (ผู้ใช้ทั่วไป, กู้ภัย, หัวหน้าหน่วย, แอดมิน)';

-- 4.2 ตาราง units: หน่วยกู้ภัย
create table public.units (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null,
  province text not null,
  district text,
  coverage_area geography(Polygon, 4326),
  contact_phone text,
  lead_user_id uuid references public.users(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.units is 'หน่วยกู้ภัยและพื้นที่จังหวัดที่รับผิดชอบ';

-- 4.3 ตาราง invites: ลิงก์เชิญสมัครเข้าหน่วยกู้ภัยผ่านกลุ่ม LINE
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete cascade,
  token text not null unique,
  created_by uuid not null references public.users(id) on delete cascade,
  max_uses integer not null default 10 check (max_uses > 0),
  used_count integer not null default 0 check (used_count >= 0 and used_count <= max_uses),
  expires_at timestamptz not null,
  is_active boolean not null default true,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.invites is 'ลิงก์เชิญกู้ภัยเข้าหน่วยผ่านกลุ่ม LINE (กำหนดวันหมดอายุและจำนวนครั้งที่ใช้ได้)';

-- 4.4 ตาราง unit_members: สมาชิกในหน่วยกู้ภัยและสถานะการอนุมัติ/ปฏิบัติงาน
create table public.unit_members (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role_in_unit text not null default 'MEMBER' check (role_in_unit in ('LEAD', 'MEMBER')),
  status public.unit_member_status not null default 'PENDING',
  duty_status public.rescuer_duty_status not null default 'OFFLINE',
  is_on_duty boolean not null default false,
  invite_id uuid references public.invites(id) on delete set null,
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_id, user_id)
);

comment on table public.unit_members is 'ความสัมพันธ์ระหว่างหน่วยกู้ภัยและสมาชิก พร้อมคิวรออนุมัติและวันหมดอายุสิทธิ์ 90 วัน';

-- ----------------------------------------------------------------------------
-- 5. ตารางระบบเคสขอความช่วยเหลือ SOS
--    (cases, case_contacts, case_people, case_needs, case_media, case_events)
-- ----------------------------------------------------------------------------

-- 5.1 ตาราง cases: ข้อมูลหลักของเคส SOS (ไม่เก็บชื่อ/เบอร์โทรในตารางนี้เพื่อแยกสิทธิ์ RLS)
create table public.cases (
  id uuid primary key default gen_random_uuid(),
  case_code text not null unique,
  tracking_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  idempotency_key text unique,
  reporter_user_id uuid references public.users(id) on delete set null,
  status public.case_status not null default 'NEW',
  urgency public.urgency_level not null,
  water_level public.water_level not null,
  priority_score integer not null default 0,
  location geography(Point, 4326) not null,
  lat double precision not null check (lat between 5 and 21),
  lng double precision not null check (lng between 97 and 106),
  accuracy_m double precision check (accuracy_m is null or accuracy_m >= 0),
  province text,
  district text,
  subdistrict text,
  landmark text not null check (btrim(landmark) <> ''),
  notes text check (notes is null or char_length(notes) <= 500),
  source text not null default 'WEB' check (source in ('WEB', 'PWA_OFFLINE', 'SMS')),
  assigned_unit_id uuid references public.units(id) on delete set null,
  assigned_rescuer_id uuid references public.users(id) on delete set null,
  version integer not null default 1 check (version >= 1),
  duplicate_of_case_id uuid references public.cases(id) on delete set null,
  is_potential_duplicate boolean not null default false,
  rescued_count integer check (rescued_count is null or rescued_count >= 0),
  resolution_note text,
  accepted_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  last_status_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.cases is 'ตารางหลักของเคสขอความช่วยเหลือ SOS (พิกัดเป็น geography(Point, 4326) และใช้ version สำหรับ Optimistic Lock)';
comment on column public.cases.location is 'พิกัดจุดเกิดเหตุชนิด geography(Point, 4326) สำหรับค้นหาระยะทางด้วย PostGIS';

-- 5.2 ตาราง case_contacts: ข้อมูลติดต่อส่วนบุคคลของผู้ประสบภัย (แยกตารางเพื่อบังคับ RLS เฉพาะผู้รับเคสและแอดมิน)
create table public.case_contacts (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  name text,
  phone text,
  phone_last4 char(4) not null check (phone_last4 ~ '^\d{4}$'),
  line_id text,
  detailed_address text,
  is_primary boolean not null default true,
  redacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.case_contacts is 'ข้อมูลติดต่อส่วนบุคคลของผู้แจ้ง (ชื่อ, เบอร์โทร, LINE ID, ที่อยู่ละเอียด) แยกจาก cases เพื่อจำกัดสิทธิ์ด้วย RLS และลบหลังปิดเคสครบ 90 วัน';

-- 5.3 ตาราง case_people: จำนวนผู้ติดค้างแยกตามกลุ่มเปราะบาง
create table public.case_people (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null unique references public.cases(id) on delete cascade,
  adults integer not null default 0 check (adults between 0 and 99),
  elderly integer not null default 0 check (elderly between 0 and 99),
  bedridden integer not null default 0 check (bedridden between 0 and 99),
  children integer not null default 0 check (children between 0 and 99),
  pets integer not null default 0 check (pets between 0 and 99),
  total_people integer generated always as (adults + elderly + bedridden + children) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (adults + elderly + bedridden + children >= 1)
);

comment on table public.case_people is 'จำนวนผู้ติดค้างในเคส แยกตามกลุ่ม (ผู้ใหญ่, ผู้สูงอายุ, ผู้ป่วยติดเตียง, เด็กเล็ก, สัตว์เลี้ยง)';

-- 5.4 ตาราง case_needs: สิ่งที่ผู้ประสบภัยต้องการในแต่ละเคส
create table public.case_needs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  need public.need_type not null,
  other_detail text check (other_detail is null or char_length(other_detail) <= 200),
  created_at timestamptz not null default now(),
  unique (case_id, need),
  check (need <> 'OTHER' or (other_detail is not null and btrim(other_detail) <> ''))
);

comment on table public.case_needs is 'รายการสิ่งที่ผู้ประสบภัยต้องการในแต่ละเคส (รองรับตัวเลือก OTHER พร้อมรายละเอียด)';

-- 5.5 ตาราง case_media: รูปภาพประกอบเคส (ไม่เกิน 3 รูปต่อเคส ขนาดไม่เกิน 500 KB)
create table public.case_media (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  storage_path text not null,
  public_url text,
  mime_type text,
  file_size_bytes integer check (file_size_bytes is null or (file_size_bytes > 0 and file_size_bytes <= 512000)),
  uploaded_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.case_media is 'รูปภาพประกอบเคสที่อัปโหลดเข้า Supabase Storage';

-- 5.6 ตาราง case_events: ประวัติเหตุการณ์และการเปลี่ยนสถานะของเคส (Append-Only ห้ามแก้ไข/ลบ)
create table public.case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete restrict,
  event_type public.case_event_type not null,
  from_status public.case_status,
  to_status public.case_status,
  actor_user_id uuid references public.users(id) on delete set null,
  actor_unit_id uuid references public.units(id) on delete set null,
  actor_role text,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.case_events is 'ไทม์ไลน์เหตุการณ์ของเคส (Append-Only: เพิ่มได้อย่างเดียว ห้ามแก้ไขหรือลบ)';

-- ----------------------------------------------------------------------------
-- 6. ตารางตำแหน่งกู้ภัยและบันทึกตรวจสอบ (rescuer_locations, audit_logs)
-- ----------------------------------------------------------------------------

-- 6.1 ตาราง rescuer_locations: ตำแหน่งล่าสุดของกู้ภัยที่เปิดโหมดปฏิบัติงาน
create table public.rescuer_locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  active_case_id uuid references public.cases(id) on delete set null,
  location geography(Point, 4326) not null,
  lat double precision not null check (lat between 5 and 21),
  lng double precision not null check (lng between 97 and 106),
  accuracy_m double precision check (accuracy_m is null or accuracy_m >= 0),
  heading double precision check (heading is null or (heading >= 0 and heading <= 360)),
  speed_mps double precision check (speed_mps is null or speed_mps >= 0),
  province text,
  is_sharing boolean not null default true,
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.rescuer_locations is 'พิกัดล่าสุดของทีมกู้ภัยขณะเปิดโหมดปฏิบัติงาน (ใช้แสดงบนแผนที่กู้ภัยและหน้าติดตามเคสสดของผู้แจ้ง)';

-- 6.2 ตาราง audit_logs: บันทึกการกระทำสำคัญและการเปิดดูข้อมูลส่วนบุคคล (Append-Only ห้ามแก้ไข/ลบ)
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  case_id uuid references public.cases(id) on delete set null,
  target_user_id uuid references public.users(id) on delete set null,
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.audit_logs is 'บันทึกตรวจสอบการกระทำสำคัญ เช่น การกดดูเบอร์โทร การอนุมัติ/ระงับสมาชิก และการลบข้อมูลส่วนตัว (Append-Only)';

-- ----------------------------------------------------------------------------
-- 7. สร้าง Indexes (รวมถึง Spatial Index บน cases.location)
-- ----------------------------------------------------------------------------

-- Spatial Indexes (PostGIS GIST)
create index idx_cases_location_gist
  on public.cases using gist (location);

create index idx_rescuer_locations_location_gist
  on public.rescuer_locations using gist (location);

create index idx_units_coverage_area_gist
  on public.units using gist (coverage_area);

-- Indexes สำหรับค้นหาและเรียงลำดับเคส
create index idx_cases_status_priority
  on public.cases (status, priority_score desc, created_at asc);

create index idx_cases_province_status
  on public.cases (province, status);

create index idx_cases_assigned_unit_status
  on public.cases (assigned_unit_id, status);

create index idx_cases_assigned_rescuer_status
  on public.cases (assigned_rescuer_id, status);

create index idx_cases_reporter_user
  on public.cases (reporter_user_id);

create index idx_cases_duplicate_of
  on public.cases (duplicate_of_case_id)
  where duplicate_of_case_id is not null;

-- Indexes สำหรับตารางย่อยของเคส
create index idx_case_contacts_case_id
  on public.case_contacts (case_id);

create index idx_case_contacts_phone
  on public.case_contacts (phone)
  where phone is not null;

create index idx_case_needs_case_id
  on public.case_needs (case_id);

create index idx_case_media_case_id
  on public.case_media (case_id);

create index idx_case_events_case_id_created
  on public.case_events (case_id, created_at asc);

-- Indexes สำหรับระบบหน่วยกู้ภัยและสมาชิก
create index idx_units_province
  on public.units (province);

create index idx_unit_members_unit_status
  on public.unit_members (unit_id, status);

create index idx_unit_members_user_status
  on public.unit_members (user_id, status);

create index idx_invites_unit_active
  on public.invites (unit_id, is_active);

-- Indexes สำหรับตำแหน่งกู้ภัยและ audit_logs
create index idx_rescuer_locations_active_case
  on public.rescuer_locations (active_case_id)
  where active_case_id is not null;

create index idx_rescuer_locations_province_sharing
  on public.rescuer_locations (province, is_sharing);

create index idx_audit_logs_actor_created
  on public.audit_logs (actor_user_id, created_at desc);

create index idx_audit_logs_case_created
  on public.audit_logs (case_id, created_at desc)
  where case_id is not null;

create index idx_audit_logs_created_at
  on public.audit_logs (created_at desc);

-- ----------------------------------------------------------------------------
-- 8. ผูก Triggers เข้ากับตาราง
-- ----------------------------------------------------------------------------

-- Triggers อัปเดต updated_at อัตโนมัติ
create trigger trg_users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

create trigger trg_units_set_updated_at
  before update on public.units
  for each row execute function public.set_updated_at();

create trigger trg_unit_members_set_updated_at
  before update on public.unit_members
  for each row execute function public.set_updated_at();

create trigger trg_cases_set_updated_at
  before update on public.cases
  for each row execute function public.set_updated_at();

create trigger trg_case_contacts_set_updated_at
  before update on public.case_contacts
  for each row execute function public.set_updated_at();

create trigger trg_case_people_set_updated_at
  before update on public.case_people
  for each row execute function public.set_updated_at();

create trigger trg_rescuer_locations_set_updated_at
  before update on public.rescuer_locations
  for each row execute function public.set_updated_at();

-- Triggers ซิงก์ lat/lng <-> geography(Point, 4326) อัตโนมัติ
create trigger trg_cases_sync_geography_point
  before insert or update on public.cases
  for each row execute function public.sync_geography_point();

create trigger trg_rescuer_locations_sync_geography_point
  before insert or update on public.rescuer_locations
  for each row execute function public.sync_geography_point();

-- Triggers บังคับ Append-Only (ห้าม UPDATE หรือ DELETE แถวที่มีอยู่แล้ว)
create trigger trg_case_events_append_only
  before update or delete on public.case_events
  for each row execute function public.prevent_append_only_mutation();

create trigger trg_audit_logs_append_only
  before update or delete on public.audit_logs
  for each row execute function public.prevent_append_only_mutation();

-- ----------------------------------------------------------------------------
-- 9. เปิดใช้งาน Row Level Security (RLS) ทุกตาราง
--    (นโยบายสิทธิ์ละเอียด 5 ระดับจะอยู่ใน TF-18)
-- ----------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.units enable row level security;
alter table public.invites enable row level security;
alter table public.unit_members enable row level security;
alter table public.cases enable row level security;
alter table public.case_contacts enable row level security;
alter table public.case_people enable row level security;
alter table public.case_needs enable row level security;
alter table public.case_media enable row level security;
alter table public.case_events enable row level security;
alter table public.rescuer_locations enable row level security;
alter table public.audit_logs enable row level security;
