-- TF-60: หน่วยกู้ภัยจริงจาก OpenStreetMap สำหรับฐานข้อมูลในเครื่อง (npm run osm:build-seed)
-- ข้อมูล © OpenStreetMap contributors สัญญา ODbL (ดู data/README.md)
-- 0 หน่วยที่ตรวจแล้ว (verified = ใช่) — ไฟล์นี้สร้างอัตโนมัติ ห้ามแก้เอง
select public.upsert_osm_units($tf60$[]$tf60$::jsonb);
