-- ============================================================================
-- TF-27: อัปเดตเคสแบบเรียลไทม์ผ่าน Supabase Realtime (postgres_changes)
--   - เพิ่มตาราง public.cases เข้า publication supabase_realtime อย่าง idempotent
--   - Realtime บังคับใช้ RLS policy บน public.cases ตามสิทธิ์ของ JWT ทุกข้อความ
--   - ไม่เพิ่มตารางข้อมูลส่วนบุคคล/สุขภาพ (case_contacts, case_sensitive_details, users) เข้า publication
-- ============================================================================

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'cases'
    )
  then
    alter publication supabase_realtime add table public.cases;
  end if;
end
$$;
