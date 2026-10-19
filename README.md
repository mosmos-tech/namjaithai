# น้ำใจไทย SOS (ThaiFlood SOS)

เว็บแอปประสานงานช่วยเหลือผู้ประสบภัยน้ำท่วม

## สิ่งที่ต้องมีในเครื่อง
- Node.js 26 (ดูไฟล์ `.nvmrc`)
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
| คำสั่ง | ใช้ทำอะไร |
|---|---|
| `npm run dev` | รันเว็บในเครื่อง |
| `npm run lint` | ตรวจรูปแบบโค้ด |
| `npm run typecheck` | ตรวจชนิดข้อมูล TypeScript |
| `npm run format` | จัดรูปแบบโค้ดอัตโนมัติ |

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
