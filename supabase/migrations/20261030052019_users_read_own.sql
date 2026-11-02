-- ============================================================================
-- TF-17: ให้ผู้ใช้ที่ล็อกอินอ่านแถว users ของตัวเองได้
--
-- หน้าเว็บและ proxy ต้องรู้บทบาท (role) และสถานะบัญชีของคนที่ล็อกอิน เพื่อพาไปหน้าที่ถูก
-- และกันหน้า /rescue /unit /admin — ตอนนี้ users เปิด RLS แต่ยังไม่มี policy เลย (อ่านไม่ได้)
--
-- ให้อ่านได้เฉพาะแถวตัวเอง ไม่ให้แก้ (role แก้ได้เฉพาะเซิร์ฟเวอร์/หัวหน้า/แอดมิน ใน TF-18, TF-19)
-- policy อื่นๆ ทั้งหมดของ users อยู่ใน TF-18
-- ============================================================================

create policy "users can read own row"
  on public.users for select
  to authenticated
  using (auth_user_id = (select auth.uid()));

grant select on public.users to authenticated;
