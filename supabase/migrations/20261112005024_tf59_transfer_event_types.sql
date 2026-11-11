-- ============================================================================
-- TF-59: ชนิดเหตุการณ์ของการส่งต่อเคส (แยกไฟล์เพราะค่า enum ใหม่ใช้ใน transaction เดียวกับที่เพิ่มไม่ได้)
--   TRANSFER_REQUESTED  หน่วยเดิมขอส่งต่อ
--   TRANSFER_ACCEPTED   หน่วยปลายทางกดรับ เคสย้ายหน่วย
--   TRANSFER_CANCELLED  ยกเลิกคำขอ (คนขอ/หัวหน้า/แอดมิน หรือระบบเมื่อเคสเปลี่ยนไปก่อน)
--   TRANSFER_EXPIRED    ไม่มีใครรับใน 15 นาที เคสกลับเข้าคิว NEW
-- ============================================================================

alter type public.case_event_type add value if not exists 'TRANSFER_REQUESTED';
alter type public.case_event_type add value if not exists 'TRANSFER_ACCEPTED';
alter type public.case_event_type add value if not exists 'TRANSFER_CANCELLED';
alter type public.case_event_type add value if not exists 'TRANSFER_EXPIRED';
