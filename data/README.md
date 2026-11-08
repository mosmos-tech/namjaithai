# data/

## units-osm.csv — หน่วยกู้ภัย/กู้ชีพจาก OpenStreetMap (TF-60)

รายชื่อจุดหน่วยกู้ภัยและกู้ชีพในประเทศไทยที่ดึงจาก [OpenStreetMap](https://www.openstreetmap.org/)
เพื่อให้ทีมตรวจทีละแถวก่อนนำเข้าเป็นหน่วยจริงที่ "ยังไม่ได้ใช้ระบบ" (`units.source = 'OSM'`, `is_active = false`)
หน่วยเหล่านี้ไม่มีเคสหรือผลงานใดๆ ผูกอยู่ และระบบไม่ยอมให้มอบเคสให้ (ดู pgTAP `tf60_osm_units`)

- **ดึงล่าสุด:** 8 พ.ย. 2569 (2026-11-08) — ดูคอลัมน์ `fetched_at` ของแต่ละแถว
- **จำนวน:** 153 แถว ใน 37 จังหวัด (13 แถวมี tag หน่วยกู้ภัยโดยตรง ที่เหลือเจอจากคำในชื่อ)

### สัญญาอนุญาต (ODbL)

ข้อมูลในไฟล์นี้ © OpenStreetMap contributors เผยแพร่ภายใต้
[Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/) — รายละเอียดที่
<https://www.openstreetmap.org/copyright>

ข้อผูกพันที่ทีมต้องทำตาม:

- **ให้เครดิต:** หน้าที่แสดงหน่วยเหล่านี้ต้องมีข้อความ "© OpenStreetMap contributors"
  พร้อมลิงก์ไปหน้า copyright ด้านบน (ตอนนี้: หน้าแอดมินจัดการหน่วย)
- **แบ่งปันแบบเดียวกัน:** ถ้าแจกจ่ายฐานข้อมูลที่ดัดแปลงจากไฟล์นี้ ต้องใช้สัญญา ODbL เหมือนกัน
- คอลัมน์ `province` / `district` / `organization` / `verified` เป็นข้อมูลที่ทีมเพิ่มเอง

### คอลัมน์

| คอลัมน์                | ความหมาย                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| `osm_id`               | `node/<id>` หรือ `way/<id>` — เปิดดูได้ที่ `https://www.openstreetmap.org/<osm_id>`                    |
| `name`                 | tag `name` ของจุดนั้น (ไม่ใช้ `operator` / `contact:name` ที่อาจเป็นชื่อบุคคล)                         |
| `organization`         | องค์กรที่เดาจากชื่อด้วยตาราง alias ใน `scripts/osm/osm-units.ts` (ไม่ตรงตาราง = ว่าง)                  |
| `province`, `district` | จากพิกัดด้วย `locate_admin_area()` ของ TF-05 (ไม่ใช้ tag `addr:*` ของ OSM)                             |
| `lat`, `lng`           | พิกัด (way ใช้จุดกลาง)                                                                                 |
| `phone`                | tag `phone` / `contact:phone` ของจุดนั้น เฉพาะสายด่วน 4 หลักหรือเบอร์สำนักงาน 02–07 (ไม่เก็บมือถือ)    |
| `fetched_at`           | วันที่ดึง                                                                                              |
| `match_reason`         | `ambulance_station` / `rescue_station` (มี tag หน่วยกู้ภัยโดยตรง) หรือ `name_keyword` (เจอจากคำในชื่อ) |
| `verified`             | `ไม่` (ค่าเริ่มต้น) / `ใช่` — นำเข้าเฉพาะแถวที่เป็น `ใช่`                                              |

แถวเรียงให้กลุ่มที่มี tag หน่วยกู้ภัย (`ambulance_station`, `rescue_station`) ขึ้นก่อน แล้วตามจังหวัด อำเภอ ชื่อ

### วิธีตรวจแถว

1. เปิด `data/units-osm.csv` (Excel / Google Sheets / VS Code) ตรวจกลุ่ม `ambulance_station` / `rescue_station` ก่อน
2. แต่ละแถว เปิด `https://www.openstreetmap.org/<osm_id>` ดูจุดและ tag แล้วถามว่า
   - เป็นหน่วยกู้ภัย/กู้ชีพที่ออกช่วยเหตุจริงไหม — **ไม่ใช่** ถ้าเป็นโรงเรียน โรงพยาบาล มูลนิธิการกุศลทั่วไป
     ศาสนสถาน หรือจุดอพยพ (คำว่า "มูลนิธิ" ในชื่อติดมาเยอะมาก)
   - ชื่อเป็นชื่อหน่วย ไม่ใช่ชื่อบุคคล
   - เบอร์ (ถ้ามี) เป็นเบอร์องค์กร ไม่ใช่เบอร์ส่วนตัว
   - จังหวัด/อำเภอตรงกับตำแหน่งจริง
3. ผ่านทุกข้อ แก้ `verified` เป็น `ใช่` · ไม่ผ่านปล่อยเป็น `ไม่` (อย่าลบแถว รันซ้ำจะได้ไม่กลับมาให้ตรวจอีก)
4. `organization`: แก้ได้เฉพาะชื่อที่อยู่ในตาราง alias — องค์กรใหม่ต้องเพิ่มใน `ORGANIZATION_ALIASES`
   (`scripts/osm/osm-units.ts`) พร้อม unit test ก่อน ระบบไม่สร้างองค์กรจากชื่อที่เดาเอง
5. ส่ง PR ที่แก้แค่ไฟล์ CSV ให้เพื่อนในทีมดูอีกรอบ

### วิธีรันซ้ำ (ดึงข้อมูลใหม่)

```bash
npm run db:start      # ใช้ฐานข้อมูลในเครื่องหาจังหวัด/อำเภอจากพิกัด
npm run osm:import    # ยิง Overpass API ครั้งเดียว แล้วเขียน data/units-osm.csv
```

- ค่า `verified` ที่ตรวจไว้แล้วไม่ถูกทับ (จับคู่ด้วย `osm_id`) แถวใหม่เป็น `ไม่`
- แถวที่ตรวจว่า `ใช่` แล้วแต่หายจาก OSM รอบนี้ยังเก็บไว้ และสคริปต์พิมพ์เตือนให้ตรวจซ้ำ
- Overpass เป็นบริการฟรีที่ใช้ร่วมกัน: สคริปต์ยิงครั้งเดียว ถ้าเซิร์ฟเวอร์ไม่ว่าง (429/502/503/504)
  หรือเน็ตหลุด จะรอ 60 แล้ว 120 วินาที ลองไม่เกิน 3 ครั้ง — อย่ารันซ้ำถี่ๆ

### นำแถวที่ตรวจแล้วเข้าฐานข้อมูล

```bash
npm run osm:build-seed       # supabase/seeds/zz_tf60_osm_units.sql — ฐานข้อมูลในเครื่อง/CI (npm run db:reset)
npm run osm:build-migration  # supabase/migrations/<เวลา>_tf60_osm_units_verified.sql — ขึ้น dev/uat/production
```

ทั้งสองคำสั่งตรวจแถว `verified = ใช่` ก่อน (osm_id ถูกรูปแบบ ไม่ซ้ำ มีจังหวัด องค์กรอยู่ในตาราง alias
เบอร์ไม่ใช่มือถือ) ผิดแถวไหนจะบอกให้แก้ CSV และไม่สร้างไฟล์ แล้วเรียก `upsert_osm_units()` ซึ่ง upsert ตาม
`osm_id` — รันซ้ำได้ผลเหมือนเดิม และไม่ปิดหน่วยที่แอดมินเปิดใช้แล้ว

**ขั้นตอนขึ้น production (หลังทีมตรวจ CSV เสร็จ — PR แยก):**

1. แตก branch จาก develop เช่น `chore/TF-60-osm-units-verified`
2. `npm run osm:build-seed` และ `npm run osm:build-migration`
3. `npm run db:reset` แล้ว `npm run test:db` ต้องผ่าน
4. เปิด PR เข้า develop พร้อม CSV, seed และ migration ใหม่ — merge แล้ว GitHub Actions ลง migration ให้เอง
   (ห้าม `db push` ขึ้น production เอง)
5. ตรวจเพิ่มรอบหลัง: รัน `npm run osm:build-migration` ใหม่เป็นไฟล์ใหม่ (migration ที่ลงไปแล้วห้ามแก้)
