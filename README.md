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

## เข้าสู่ระบบด้วย LINE (TF-17)

1. สร้าง **LINE Login channel** ที่ [LINE Developers Console](https://developers.line.biz/console/) (App type: Web app)
2. แท็บ **LINE Login** → Callback URL: `http://127.0.0.1:54321/auth/v1/callback` (เว็บจริงใช้ `https://<project>.supabase.co/auth/v1/callback`)
3. ใส่ `LINE_CHANNEL_ID`, `LINE_CHANNEL_SECRET` และ `SUPER_ADMIN_LINE_IDS` ใน `.env.local` (ดู `.env.example`)
4. รัน `npm run auth:setup-line` — **ต้องรันใหม่ทุกครั้งหลัง `npm run db:reset`** เพราะ Supabase เก็บค่านี้ในฐานข้อมูล

หลังล็อกอินพาไปหน้าตามบทบาท: ผู้ใช้ `/my-cases` · กู้ภัย `/rescue` · หัวหน้าหน่วย `/unit` · แอดมิน `/admin` (กติกาอยู่ใน `src/lib/domain/roles.ts`)

## สิทธิ์การเข้าถึงข้อมูล (RLS · TF-18)

กติกาอยู่ใน `supabase/migrations/*_rls_policies.sql` ทดสอบด้วย `npm run test:db` (ต้องเปิด Supabase ในเครื่องก่อน)

| ใคร              | เห็นเคส                                    | ชื่อ/เบอร์/ที่อยู่ละเอียด/รูป |
| ---------------- | ------------------------------------------ | ----------------------------- |
| ไม่ล็อกอิน       | อ่านตารางตรงๆ ไม่ได้ (แจ้ง/ติดตามผ่าน API) | ไม่ได้                        |
| ผู้ใช้ทั่วไป     | เฉพาะที่ตัวเองแจ้ง                         | ของตัวเอง                     |
| กู้ภัย / หัวหน้า | จังหวัดของหน่วย + เคสที่มอบให้ตัวเอง/หน่วย | เฉพาะเคสที่ตัวเองรับ          |
| แอดมิน           | ทุกพื้นที่                                 | ทุกเคส                        |

- พื้นที่หน่วย = `units.province` ต้องสะกดตรงกับชื่อจังหวัดในตาราง `provinces` (เช่น `กรุงเทพมหานคร`)
- หัวหน้าแก้/เอาสมาชิกออกและมอบหมายเคสได้เฉพาะหน่วยตัวเอง; `audit_logs` แก้/ลบ/ล้างไม่ได้ แม้แต่แอดมิน

## E2E test (Playwright · TF-48)

เปิดเว็บจริงใน Chrome แล้วกดแบบผู้ใช้ รันทุก test 2 ขนาดจอ: **mobile** (iPhone SE 375×667) และ **desktop** (1280×800)

```bash
npm run db:start        # ต้องเปิด Supabase ในเครื่องก่อน (test ใช้ฐานข้อมูลในเครื่องเท่านั้น)
npm run e2e             # รันทั้งหมดแบบไม่เห็นจอ (เปิด npm run dev ให้เอง ถ้าเปิดค้างไว้จะใช้ตัวนั้น)
npm run e2e:headed      # เห็นเบราว์เซอร์กดทีละขั้น
npm run e2e:ui          # UI mode: เลือก test, ดูทีละขั้น, ย้อนดูหน้าจอ
npx playwright test e2e/auth.spec.ts --project=mobile   # รันเฉพาะไฟล์/ขนาดจอ
```

- ต้องมี Google Chrome ในเครื่อง ครั้งแรกรัน `npx playwright install ffmpeg` (ใช้อัดวิดีโอตอน test ล้ม)
- test ล้มแล้วดูวิดีโอ/ภาพหน้าจอได้ใน `test-results/` (ใน CI โหลดได้จาก Artifacts ของ job **e2e**)
- ก่อนรัน ระบบล้างตัวนับ rate limit ในฐานข้อมูลในเครื่องให้ (`e2e/global-setup.ts`) และจะไม่ยอมรันถ้าชี้ไป Supabase ที่ไม่ใช่ในเครื่อง

**เพิ่ม test ใหม่**

1. สร้างไฟล์ `e2e/<ชื่อหน้า>.spec.ts` หรือเพิ่มในไฟล์ของหน้านั้น ตั้งชื่อ test เป็นภาษาไทยตามเกณฑ์ผ่านของการ์ด
2. หาปุ่ม/ช่องจากสิ่งที่ผู้ใช้เห็น: `page.getByRole("button", { name: "ดูสถานะเคส" })`, `getByText`, `getByPlaceholder` — **ห้ามใช้ class CSS**
3. ต่างกันระหว่างมือถือ/จอคอม ใช้ `isMobile` และ `test.skip(...)` เฉพาะข้อนั้น
4. ต้องการเคสตั้งต้นใช้ `createCaseViaApi()` ใน `e2e/helpers/db.ts` (สุ่มเบอร์/พิกัดให้ ไม่ชนการตรวจเคสซ้ำ)
5. เจอบั๊กห้ามแก้ test ให้ผ่าน — ใส่ `test.fail(true, "บั๊ก E2E-n: ...")` แล้วแจ้งทีม พอแก้บั๊กแล้ว test จะล้มเตือนให้เอา `test.fail` ออก

บั๊กที่ test เจออยู่ตอนนี้: **E2E-1** ลิงก์ "นโยบายความเป็นส่วนตัว" ใน footer ไปหน้า `/privacy` ที่ยังไม่มี · **E2E-2** ส่ง SOS ด้วยเบอร์ซ้ำ ไม่มีปุ่ม "อัปเดตเคสเดิม / สร้างใหม่" (TF-16)
