-- ============================================================================
-- TF-18: Row Level Security ทุกตาราง ตามสิทธิ์ 5 ระดับ
--
--   ผู้เยี่ยมชม (anon)      อ่านตารางเคสตรงๆ ไม่ได้เลย (แจ้ง/ติดตามผ่าน API ฝั่งเซิร์ฟเวอร์)
--   ผู้ใช้ทั่วไป (USER)      เห็นเฉพาะเคสที่ตัวเองแจ้ง (รวมข้อมูลติดต่อของตัวเอง)
--   กู้ภัย (RESCUER)         เห็นเคสในจังหวัดของหน่วย + เคสที่ตัวเอง/หน่วยตัวเองได้รับ
--                           ชื่อ เบอร์ ที่อยู่ละเอียด และรูป เห็นเฉพาะเคสที่ตัวเองรับ
--   หัวหน้าหน่วย (UNIT_LEAD) เหมือนกู้ภัย + จัดการสมาชิกและมอบหมายเคสได้เฉพาะหน่วยตัวเอง
--   แอดมิน (ADMIN)           เห็นทุกพื้นที่ (audit_logs ก็แก้/ลบไม่ได้)
--
-- กติกาที่ตกลงกับทีม (2 พ.ย. 2569):
--   - พื้นที่หน่วย = จังหวัดเดียวกัน (units.province = cases.province ชื่อไทยแบบตาราง provinces)
--   - ข้อมูลติดต่อและรูป: กู้ภัยที่รับเคส + แอดมิน (+ ผู้แจ้งเอง) หัวหน้าหน่วยไม่เห็น
--   - โน้ต (cases.notes) กู้ภัยในพื้นที่เห็นได้ ช่วยประเมินความเร่งด่วนก่อนรับ
--   - เคสที่มอบให้ตัวเอง/หน่วยตัวเอง เห็นเสมอแม้อยู่นอกจังหวัด
--
-- เรียกผ่าน service_role (API /api/cases, /api/track) ข้าม RLS ได้ตามเดิม
-- การรับเคส/เปลี่ยนสถานะของกู้ภัย ทำผ่านฟังก์ชันฝั่งฐานข้อมูลใน TF-25/26 (มี optimistic lock)
-- ============================================================================

set search_path = public, extensions;

-- ----------------------------------------------------------------------------
-- 1. ฟังก์ชันช่วยเช็กสิทธิ์ (schema rls ไม่เปิดผ่าน API เรียกเป็น RPC ไม่ได้)
--    security definer: อ่านตาราง users/unit_members/cases ได้โดยไม่ติด RLS ของตารางเหล่านั้นเอง
--    (ไม่งั้น policy ของ cases ที่ถาม unit_members ที่ถาม cases จะวนไม่จบ)
--    ทุกตัวดูเฉพาะผู้ใช้ที่สถานะ ACTIVE — ถูกระงับแล้วเห็นอะไรไม่ได้เลย
-- ----------------------------------------------------------------------------
create schema if not exists rls;
revoke all on schema rls from public;
grant usage on schema rls to anon, authenticated;

-- users.id ของคนที่ล็อกอินอยู่
create or replace function rls.current_user_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select u.id from public.users u
  where u.auth_user_id = auth.uid() and u.status = 'ACTIVE'
$$;

create or replace function rls.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.users u
    where u.auth_user_id = auth.uid() and u.status = 'ACTIVE' and u.role = 'ADMIN'
  )
$$;

-- หน่วยที่ผู้ใช้เป็นสมาชิกที่อนุมัติแล้วและยังไม่หมดอายุ (only_lead = เฉพาะหน่วยที่เป็นหัวหน้า)
create or replace function rls.my_unit_ids(only_lead boolean default false)
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select m.unit_id
  from public.unit_members m
  join public.units un on un.id = m.unit_id and un.is_active
  where m.user_id = rls.current_user_id()
    and m.status = 'APPROVED'
    and (m.expires_at is null or m.expires_at > now())
    and (not only_lead or m.role_in_unit = 'LEAD')
$$;

-- จังหวัดที่ผู้ใช้ดูแล (ผ่านหน่วยที่สังกัด)
create or replace function rls.my_provinces()
returns setof text
language sql stable security definer
set search_path = ''
as $$
  select un.province from public.units un where un.id in (select rls.my_unit_ids())
$$;

-- เห็นเคสนี้ไหม: แอดมิน / ผู้แจ้ง / คนหรือหน่วยที่ได้รับเคส / กู้ภัยในจังหวัดของหน่วย
create or replace function rls.can_see_case(p_case_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select rls.is_admin() or exists (
    select 1 from public.cases c
    where c.id = p_case_id
      and (
        c.reporter_user_id = rls.current_user_id()
        or c.assigned_rescuer_id = rls.current_user_id()
        or c.assigned_unit_id in (select rls.my_unit_ids())
        or c.province in (select rls.my_provinces())
      )
  )
$$;

-- เห็นข้อมูลส่วนตัวของเคสนี้ไหม (ชื่อ เบอร์ ที่อยู่ละเอียด รูป): แอดมิน / กู้ภัยที่รับเคส / ผู้แจ้งเอง
create or replace function rls.can_see_case_private(p_case_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select rls.is_admin() or exists (
    select 1 from public.cases c
    where c.id = p_case_id
      and (
        c.assigned_rescuer_id = rls.current_user_id()
        or c.reporter_user_id = rls.current_user_id()
      )
  )
$$;

revoke all on all functions in schema rls from public;
grant execute on all functions in schema rls to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. ปิดสิทธิ์พื้นฐานของผู้ไม่ล็อกอินกับตารางที่มีข้อมูลเคส/ผู้ใช้ (กันพลาดอีกชั้นนอกจาก RLS)
--    Supabase ให้ anon/authenticated ทำทุกอย่างกับตารางใหม่เป็นค่าเริ่มต้น เหลือไว้แค่ที่ต้องใช้
-- ----------------------------------------------------------------------------
revoke all on
  public.users, public.units, public.unit_members, public.invites,
  public.cases, public.case_contacts, public.case_people, public.case_needs,
  public.case_media, public.case_events, public.rescuer_locations, public.audit_logs
from anon;

revoke all on
  public.users, public.units, public.unit_members, public.invites,
  public.cases, public.case_contacts, public.case_people, public.case_needs,
  public.case_media, public.case_events, public.rescuer_locations, public.audit_logs
from authenticated;

grant select on
  public.users, public.units, public.unit_members, public.invites,
  public.cases, public.case_contacts, public.case_people, public.case_needs,
  public.case_media, public.case_events, public.rescuer_locations, public.audit_logs
to authenticated;

-- เขียนได้เฉพาะที่มี policy รองรับข้างล่าง (คอลัมน์ที่ไม่อยู่ในรายการแก้ไม่ได้แม้ policy ผ่าน)
grant insert, update, delete on public.units, public.invites to authenticated;
grant insert, update, delete on public.unit_members to authenticated; -- insert ผ่าน policy ของแอดมินเท่านั้น
grant update (role, status) on public.users to authenticated;
-- มอบหมายเคส: แก้ได้แค่หน่วย/คนที่รับ — เปลี่ยนสถานะทำผ่านฟังก์ชัน TF-25/26
grant update (assigned_unit_id, assigned_rescuer_id) on public.cases to authenticated;
grant insert, update on public.rescuer_locations to authenticated;

-- ----------------------------------------------------------------------------
-- 3. users
-- ----------------------------------------------------------------------------
-- (มีอยู่แล้วจาก TF-17) "users can read own row"

create policy "admin reads all users" on public.users
  for select to authenticated
  using ((select rls.is_admin()));

-- เห็นชื่อเพื่อนร่วมหน่วย (หัวหน้าใช้จัดการสมาชิก กู้ภัยใช้ดูว่าใครรับเคสอะไร)
create policy "members read users in same unit" on public.users
  for select to authenticated
  using (
    exists (
      select 1 from public.unit_members m
      where m.user_id = users.id and m.unit_id in (select rls.my_unit_ids())
    )
  );

-- เปลี่ยนบทบาท/ระงับบัญชี: แอดมินเท่านั้น
create policy "admin updates users" on public.users
  for update to authenticated
  using ((select rls.is_admin()))
  with check ((select rls.is_admin()));

-- ----------------------------------------------------------------------------
-- 4. units / unit_members / invites
-- ----------------------------------------------------------------------------
create policy "signed-in users read units" on public.units
  for select to authenticated
  using (true);

create policy "admin manages units" on public.units
  for all to authenticated
  using ((select rls.is_admin()))
  with check ((select rls.is_admin()));

-- หัวหน้าแก้ข้อมูลหน่วยเองไม่ได้ (ไม่งั้นเปลี่ยนจังหวัดเพื่อขยายพื้นที่ไปเห็นเคสที่อื่นได้) — แอดมินจัดการ (TF-30)

-- สมาชิก: เห็นแถวของตัวเอง (รวมตอนรออนุมัติ) และสมาชิกในหน่วยเดียวกัน
create policy "read own and same-unit memberships" on public.unit_members
  for select to authenticated
  using (
    user_id = (select rls.current_user_id())
    or unit_id in (select rls.my_unit_ids())
    or (select rls.is_admin())
  );

-- หัวหน้าแก้สมาชิก (อนุมัติ/ระงับ/สถานะงาน) และเอาออกได้เฉพาะหน่วยตัวเอง ย้ายไปหน่วยอื่นไม่ได้
-- เพิ่มสมาชิกเองไม่ได้: คนเข้าหน่วยผ่านลิงก์เชิญ (TF-19) ไม่งั้นหัวหน้าดึงใครก็ได้เข้ามาโดยเจ้าตัวไม่รู้
create policy "lead updates own unit members" on public.unit_members
  for update to authenticated
  using (unit_id in (select rls.my_unit_ids(true)))
  with check (unit_id in (select rls.my_unit_ids(true)));

create policy "lead removes own unit members" on public.unit_members
  for delete to authenticated
  using (unit_id in (select rls.my_unit_ids(true)));

create policy "admin manages memberships" on public.unit_members
  for all to authenticated
  using ((select rls.is_admin()))
  with check ((select rls.is_admin()));

create policy "lead manages own unit invites" on public.invites
  for all to authenticated
  using (unit_id in (select rls.my_unit_ids(true)) or (select rls.is_admin()))
  with check (unit_id in (select rls.my_unit_ids(true)) or (select rls.is_admin()));

-- ----------------------------------------------------------------------------
-- 5. cases และตารางลูก
-- ----------------------------------------------------------------------------
-- เงื่อนไขเดียวกับ rls.can_see_case แต่เขียนตรงๆ ให้ใช้ index ได้ (ตารางใหญ่สุด ถูกอ่านบ่อยสุด)
create policy "read visible cases" on public.cases
  for select to authenticated
  using (
    (select rls.is_admin())
    or reporter_user_id = (select rls.current_user_id())
    or assigned_rescuer_id = (select rls.current_user_id())
    or assigned_unit_id in (select rls.my_unit_ids())
    or province in (select rls.my_provinces())
  );

-- มอบหมายเคส: หัวหน้าเฉพาะเคสที่หน่วยตัวเองเห็น และมอบให้ได้แค่หน่วยตัวเอง/สมาชิกหน่วยตัวเอง
create policy "lead assigns cases within own unit" on public.cases
  for update to authenticated
  using (
    (select rls.is_admin())
    or (
      exists (select 1 from rls.my_unit_ids(true))
      and (
        province in (select un.province from public.units un where un.id in (select rls.my_unit_ids(true)))
        or assigned_unit_id in (select rls.my_unit_ids(true))
      )
    )
  )
  with check (
    (select rls.is_admin())
    or (
      (assigned_unit_id is null or assigned_unit_id in (select rls.my_unit_ids(true)))
      and (
        assigned_rescuer_id is null
        or exists (
          select 1 from public.unit_members m
          where m.user_id = assigned_rescuer_id
            and m.unit_id in (select rls.my_unit_ids(true))
            and m.status = 'APPROVED'
        )
      )
    )
  );

create policy "read people of visible cases" on public.case_people
  for select to authenticated
  using (rls.can_see_case(case_id));

create policy "read needs of visible cases" on public.case_needs
  for select to authenticated
  using (rls.can_see_case(case_id));

create policy "read events of visible cases" on public.case_events
  for select to authenticated
  using (rls.can_see_case(case_id));

-- ข้อมูลส่วนตัว: กู้ภัยที่รับเคส + แอดมิน + ผู้แจ้งเอง
create policy "read contacts of own or accepted cases" on public.case_contacts
  for select to authenticated
  using (rls.can_see_case_private(case_id));

create policy "read media of own or accepted cases" on public.case_media
  for select to authenticated
  using (rls.can_see_case_private(case_id));

-- ----------------------------------------------------------------------------
-- 6. rescuer_locations: เห็นในหน่วยเดียวกัน + แอดมิน, เขียนได้เฉพาะตำแหน่งตัวเอง
-- ----------------------------------------------------------------------------
create policy "read locations in same unit" on public.rescuer_locations
  for select to authenticated
  using (
    user_id = (select rls.current_user_id())
    or unit_id in (select rls.my_unit_ids())
    or (select rls.is_admin())
  );

create policy "rescuer writes own location" on public.rescuer_locations
  for insert to authenticated
  with check (
    user_id = (select rls.current_user_id())
    and (unit_id is null or unit_id in (select rls.my_unit_ids()))
  );

create policy "rescuer updates own location" on public.rescuer_locations
  for update to authenticated
  using (user_id = (select rls.current_user_id()))
  with check (
    user_id = (select rls.current_user_id())
    and (unit_id is null or unit_id in (select rls.my_unit_ids()))
  );

-- ----------------------------------------------------------------------------
-- 7. audit_logs: แอดมินอ่านได้อย่างเดียว ไม่มีใครแก้/ลบได้ (แม้แต่แอดมิน)
--    trigger ของ TF-04 กันแก้/ลบทีละแถวอยู่แล้ว เพิ่มกัน TRUNCATE (ล้างทั้งตาราง) อีกชั้น
-- ----------------------------------------------------------------------------
create policy "admin reads audit logs" on public.audit_logs
  for select to authenticated
  using ((select rls.is_admin()));

create or replace function public.prevent_append_only_truncate()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  raise exception 'Table %.% is append-only: TRUNCATE is not allowed', tg_table_schema, tg_table_name
    using errcode = '42501';
end;
$$;

create trigger trg_audit_logs_no_truncate
  before truncate on public.audit_logs
  for each statement execute function public.prevent_append_only_truncate();

create trigger trg_case_events_no_truncate
  before truncate on public.case_events
  for each statement execute function public.prevent_append_only_truncate();

-- ----------------------------------------------------------------------------
-- 8. index ช่วยให้เช็กสิทธิ์เร็ว (policy ถามบ่อยทุกแถว)
-- ----------------------------------------------------------------------------
create index if not exists idx_unit_members_user_status on public.unit_members (user_id, status);
create index if not exists idx_cases_assigned_rescuer on public.cases (assigned_rescuer_id);
create index if not exists idx_cases_assigned_unit on public.cases (assigned_unit_id);
create index if not exists idx_cases_reporter on public.cases (reporter_user_id);
