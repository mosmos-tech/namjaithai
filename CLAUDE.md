# น้ำใจไทย SOS (ThaiFlood SOS) — คู่มือสำหรับ AI ผู้ช่วยเขียนโค้ด

@AGENTS.md

## ภาพรวม
เว็บแอป (ไม่ใช่แอปมือถือ) ประสานงานช่วยเหลือผู้ประสบภัยน้ำท่วม เป็นโปรเจกต์นักศึกษา ทีม 3 คน นำเสนออาจารย์
ผู้ประสบภัยกด SOS แจ้งตำแหน่ง → ทีมกู้ภัยเห็นบนแผนที่ รับเคส อัปเดตสถานะ → ผู้แจ้งติดตามแบบแผนที่สด (คล้ายติดตามพัสดุ Shopee)
ผู้ใช้หลักใช้มือถือตอนน้ำท่วม รวมถึงผู้สูงอายุ: ปุ่มใหญ่ ≥48px, ข้อความน้อย, ระยะห่างเยอะ, ต้องใช้ได้บนจอ 360px

## Stack
- Next.js 16 (App Router, Turbopack, Cache Components เปิดอยู่ → หน้าที่อ่าน cookies/ข้อมูลสดต้องครอบ <Suspense>)
- TypeScript, Tailwind v4, shadcn/ui, Zod, Vitest
- Supabase (Postgres + PostGIS, Auth, Storage, RLS, pg_cron) — รันในเครื่องด้วย Docker, CLI ใช้ผ่าน `npx supabase`
- ล็อกอินด้วย LINE, แผนที่ MapLibre + OpenStreetMap, PWA (Service Worker + IndexedDB) สำหรับส่ง SOS ตอนออฟไลน์
- Deploy: Vercel; Node 24 (.nvmrc)

## คำสั่ง
- `npm run dev` · `npm run lint` · `npm run typecheck` · `npm run format` · `npm test`
- `npm run db:start` / `db:stop` / `db:reset` · `npx supabase migration new <ชื่อ>`

## โครงโค้ด
- `src/app` หน้าเว็บ · `src/components/ui` shadcn · `src/features/<sos|cases|rescue|admin>` โค้ดตามฟีเจอร์
- `src/lib/supabase/{client,server}.ts` ตัวเชื่อม Supabase (ห้ามสร้าง client เองที่อื่น)
- `src/lib/domain` กติกากลาง: enums, สถานะเคส (canTransition), priorityScore, sosSchema — ใช้ซ้ำทั้งฟอร์มและ API ห้ามเขียนกติกาซ้ำ
- `supabase/migrations` แก้ฐานข้อมูลผ่าน migration เท่านั้น ห้ามแก้ใน Studio

## กติกาโดเมน
- บทบาท 5 ระดับ: ผู้เยี่ยมชม (ไม่ล็อกอิน) / ผู้ใช้ทั่วไป (LINE) / กู้ภัย / หัวหน้าหน่วย / แอดมิน
- หน้า /login หน้าเดียวสำหรับทุกคน มีแค่ 2 ทาง: "ขอความช่วยเหลือทันที" (ไม่ล็อกอิน) และ "เข้าสู่ระบบด้วย LINE"
  ไม่มีหน้าสมัครสมาชิกบนเว็บ — กู้ภัยสมัครผ่านลิงก์ในกลุ่ม LINE ของหน่วย แล้วหัวหน้าหน่วยอนุมัติ
- หลังล็อกอินพาไปตามบทบาท: ผู้ใช้→เคสของฉัน, กู้ภัย→แผนที่, หัวหน้า→หน่วยของฉัน, แอดมิน→ห้องสั่งการ
- สถานะเคส: NEW → ACCEPTED → EN_ROUTE → ON_SITE → AWAITING_CONFIRMATION → RESOLVED (TF-26)
  ทีละขั้น ข้ามขั้น/ถอยหลังไม่ได้ (canTransition ใน src/lib/domain + trigger guard_case_status_transition ในฐานข้อมูล)
  กู้ภัยกด "ช่วยเสร็จแล้ว" ไป AWAITING_CONFIRMATION เท่านั้น ปิดเคสเองไม่ได้ · RESOLVED ต้องผ่านผู้แจ้งยืนยัน/timeout/หัวหน้า (TF-58)
  ปล่อยกลับ NEW ได้ผ่าน release_case เท่านั้น · ปิดด้วย CANCELLED (ผู้แจ้งกดปลอดภัยแล้ว หรือหัวหน้า/ระบบ) / DUPLICATE / UNREACHABLE (หัวหน้า/ระบบ)
  รับเคสใช้ optimistic lock (คอลัมน์ version) และกู้ภัยถือเคสพร้อมกันได้ไม่เกิน 2 เคส; แอดมินไม่รับเคสเอง (มอบหมายแทน)
- ความเร่งด่วน RED > YELLOW > GREEN เสมอ; ฟอร์ม SOS 5 ขั้น: สถานการณ์ → ตำแหน่ง → ผู้ติดค้าง → สิ่งที่ต้องการ (+อื่นๆ พิมพ์เอง) → ข้อมูลติดต่อ
- ผู้แจ้งไม่เลือกสีเองและไม่เห็นระดับ: เซิร์ฟเวอร์คำนวณด้วย computeTriage() (src/lib/domain/triage.ts) จากสัญญาณอันตราย ออกเองได้ไหม ระดับน้ำ และกลุ่มเปราะบาง; กู้ภัยที่รับเคส/หัวหน้าหน่วยนั้น/แอดมินปรับได้พร้อมเหตุผล (audit_logs)
- ความเป็นส่วนตัว: ชื่อ/เบอร์/ที่อยู่ละเอียดของผู้ประสบภัย เห็นเฉพาะทีมที่รับเคสนั้นและแอดมิน; บังคับด้วย RLS ไม่ใช่แค่ซ่อนปุ่ม
- Realtime เฉพาะกู้ภัย/แอดมิน; ผู้แจ้งดึงข้อมูลใหม่ทุก 15–30 วินาที (polling) เพื่อไม่กินโควตา
- ติดตามเคสด้วย รหัสเคส + เบอร์ 4 ตัวท้าย; ส่ง SOS ตอนไม่มีเน็ตต้องขึ้นหน้าจอเต็ม "บันทึกไว้ในเครื่องแล้ว — ยังไม่ถึงทีมกู้ภัย"
- ทุกการกระทำสำคัญบันทึก audit_logs (แก้/ลบไม่ได้); ปี พ.ศ. ในหน้าจอ

## ดีไซน์ (Figma: https://www.figma.com/design/rFwX4FyXxsq38MzUz5j6p0)
- โทนฟ้า-ขาว ตัวหนังสือดำ ปุ่มมนเต็ม การ์ดมุม 12–14
- ฟอนต์: Bai Jamjuree (หัวข้อ) · IBM Plex Sans Thai Looped (เนื้อหา) · IBM Plex Mono (รหัสเคส/ตัวเลข)
- ลายประจำ: ไม้วัดระดับน้ำ; navbar พื้นเทาอ่อน; ปุ่ม LINE มีโลโก้
- ข้อความบนหน้าจอเป็นภาษาไทยทั้งหมด

## วิธีทำงานของทีม
- ทำงานเป็นการ์ด TF-XX บนบอร์ด Scrum; แตก branch จาก develop ตามชื่อบนการ์ด (feature/ chore/ test/ fix/)
- commit ขึ้นต้นด้วยรหัสการ์ด เช่น `TF-07: ...`; เปิด PR เข้า develop; ห้าม push ตรงเข้า main/uat/develop (มี ruleset บังคับ)
- สภาพแวดล้อม local → dev (develop) → uat → production (main) ดู docs/environments.md: migration ขึ้น Supabase ผ่าน GitHub Actions เท่านั้น ห้าม db push ขึ้น production เอง
- migration ใหม่ต้องมี timestamp ใหม่กว่า migration ล่าสุดใน develop (Supabase ไม่ยอมลงไฟล์ที่เก่ากว่าตัวที่ลงไปแล้ว Deploy DB จะล้มและ migration ที่ตามมาไม่ได้ลงเลย)
  ก่อน push: `git fetch origin && git rebase origin/develop` แล้ว `npm run check:migrations` ถ้าไม่ผ่านให้เปลี่ยนชื่อไฟล์เป็นเวลาปัจจุบัน แล้ว `db:reset` + `test:db` ใหม่ — CI เช็กซ้ำทุก PR
- ก่อนเปิด PR: lint, typecheck, test ต้องผ่าน; ไม่มีคีย์ลับในโค้ด (.env.local ไม่ขึ้น git)
- รายละเอียดและเกณฑ์ผ่านของการ์ดทุกใบอยู่ใน docs/backlog.md (สถานะ/คนหยิบดูที่บอร์ด)

## การสื่อสารกับผู้ใช้
ผู้ใช้เป็นนักศึกษาที่กำลังเรียนเขียนโปรแกรม: อธิบายเป็นภาษาไทย บอกว่าแต่ละไฟล์/ฟังก์ชันทำอะไรและทำไม
ก่อนทำงานใหญ่ให้สรุปแผนสั้นๆ ก่อน และอย่า commit/push เองถ้าผู้ใช้ไม่ได้สั่ง