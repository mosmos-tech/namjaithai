# น้ำใจไทย SOS (ThaiFlood SOS)

เว็บแอปประสานงานช่วยเหลือผู้ประสบภัยน้ำท่วม

## สิ่งที่ต้องมีในเครื่อง

- Node.js 24 (ดูไฟล์ `.nvmrc`)
- Git

## รันในเครื่อง

```bash
git clone <ลิงก์ repo>
cd namjaithai
npm install
npm run dev
```

เปิด http://localhost:3000

## คำสั่งที่ใช้บ่อย

| คำสั่ง              | ใช้ทำอะไร                 |
| ------------------- | ------------------------- |
| `npm run dev`       | รันเว็บในเครื่อง          |
| `npm run lint`      | ตรวจรูปแบบโค้ด            |
| `npm run typecheck` | ตรวจชนิดข้อมูล TypeScript |
| `npm run format`    | จัดรูปแบบโค้ดอัตโนมัติ    |

## วิธีทำงานเป็นทีม

1. แตก branch จาก `develop` ตามชื่อบนการ์ด เช่น `feature/TF-08-sos-step1`
2. commit ขึ้นต้นด้วยรหัสการ์ด เช่น `TF-08: เพิ่มฟอร์มขั้นที่ 1`
3. เปิด Pull Request เข้า `develop` ให้เพื่อน 1 คนรีวิวก่อน merge
4. ห้าม push ตรงเข้า `main` หรือ `develop`

## โครงโฟลเดอร์

- `src/app` หน้าเว็บแต่ละหน้า
- `src/components/ui` ปุ่ม ฟอร์ม (shadcn/ui)
- `src/features` โค้ดแยกตามฟีเจอร์ (sos, cases, rescue, admin)
- `src/lib` ฟังก์ชันกลาง
- `src/types` ชนิดข้อมูลที่ใช้ร่วมกัน
- `docs` เอกสาร เช่น ER diagram

## ฐานข้อมูล (Supabase ในเครื่อง)

ต้องติดตั้งและเปิด **Docker Desktop** ก่อน

```bash
npm run db:start                 # ครั้งแรกรอ 5–10 นาที
npx supabase status -o env       # ดูคีย์
cp .env.example .env.local       # แล้วใส่ค่า PUBLISHABLE_KEY ลงไป
npm run dev
```

เปิด http://localhost:3000/dev/db ต้องขึ้น "เชื่อมต่อฐานข้อมูลสำเร็จ 🎉"

| คำสั่ง                            | ใช้ทำอะไร                                        |
| --------------------------------- | ------------------------------------------------ |
| `npm run db:start` / `db:stop`    | เปิด/ปิดฐานข้อมูลในเครื่อง                       |
| `npm run db:reset`                | ล้างแล้วสร้างฐานข้อมูลใหม่จาก migrations ทั้งหมด |
| `npx supabase migration new ชื่อ` | สร้างไฟล์ migration ใหม่                         |
| Studio                            | http://127.0.0.1:54323                           |

**ห้ามสร้างหรือแก้ตารางผ่าน Studio** ให้เขียนเป็น migration เสมอ เพื่อนจะได้ฐานข้อมูลเหมือนกัน

## ข้อมูลจังหวัด/อำเภอ/ตำบล

`npm run db:reset` โหลด 77 จังหวัด 928 อำเภอ 7,425 ตำบล พร้อมขอบเขต จาก `supabase/seeds/thai_admin_areas.sql` ให้อัตโนมัติ

| API                                        | ได้อะไร                                        |
| ------------------------------------------ | ---------------------------------------------- |
| `GET /api/geo/provinces`                   | จังหวัดทั้งหมด เรียงตามชื่อไทย                 |
| `GET /api/geo/provinces/10/districts`      | อำเภอ/เขตในจังหวัด (รหัส 2 หลัก)               |
| `GET /api/geo/districts/1001/subdistricts` | ตำบล/แขวงในอำเภอ (รหัส 4 หลัก)                 |
| `GET /api/geo/reverse?lat=13.76&lng=100.5` | จังหวัด/อำเภอ/ตำบลของพิกัด (404 ถ้าอยู่นอกไทย) |

ไฟล์ seed สร้างจาก `npm run geo:build-seed` (โหลดไฟล์ต้นฉบับ ~375 MB ไว้ใน `.cache/geo`) ไม่ต้องรันเองนอกจากจะอัปเดตข้อมูล และห้ามแก้ไฟล์ seed ด้วยมือ

ข้อมูลขอบเขต: [OCHA / Royal Thai Survey Department](https://data.humdata.org/dataset/cod-ab-tha) (CC BY-IGO)
