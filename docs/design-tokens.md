# Design tokens — น้ำใจไทย SOS

> ดึงจาก Figma (ไฟล์ ThaiFlood SOS — UI Design, หน้า 00 · Foundations & Components)
> https://www.figma.com/design/rFwX4FyXxsq38MzUz5j6p0
> ใช้ชื่อเดียวกับ Figma ในโค้ด (เช่น CSS variable `--color-primary-600` ↔ Figma `primary/600`) เวลาคุยกับคนออกแบบจะได้ตรงกัน

## สี

| Figma | Hex | ใช้กับ |
|---|---|---|
| `bg/page` | `#F5F8FC` | พื้นหลังหน้า |
| `bg/surface` | `#FFFFFF` | การ์ด แผง |
| `bg/subtle` | `#E8F1FB` | พื้นอ่อนในการ์ด |
| `bg/nav` | `#F1F3F5` | พื้น navbar (เทาอ่อน) |
| `primary/50` | `#EEF5FE` | พื้นป้าย/ไอคอนอ่อน |
| `primary/100` | `#D6E7FB` | เส้น/พื้นฟ้าอ่อน |
| `primary/500` | `#3B86E0` | น้ำในไม้วัดระดับ |
| `primary/600` | `#1F6FD1` | ปุ่มหลัก ลิงก์ |
| `primary/700` | `#1757A6` | แถบสายด่วนด้านบน กระดานสถานการณ์ |
| `text/primary` | `#111827` | ตัวหนังสือหลัก |
| `text/secondary` | `#4B5565` | ตัวหนังสือรอง |
| `text/on-primary` | `#FFFFFF` | ตัวหนังสือบนพื้นเข้ม |
| `border/default` | `#D9E3EF` | เส้นขอบปกติ |
| `border/strong` | `#A7BEDA` | เส้นขอบปุ่ม outline |
| `red/600` | `#C62828` | ปุ่ม SOS, วิกฤต |
| `red/50` | `#FDECEC` | พื้นแจ้งเตือนแดง |
| `amber/500` | `#F2A516` | เร่งด่วน (จุดสี) |
| `amber/700` | `#9A5B00` | ตัวหนังสือเตือนส้ม |
| `amber/50` | `#FFF5DC` | พื้นกล่องเตือนส้ม (หน้ารอส่ง) |
| `green/700` | `#1B7A3A` | ทั่วไป, สำเร็จ |
| `green/50` | `#E5F5EA` | พื้นสำเร็จ |
| `gray/700` | `#475467` | KPI "เคสที่เปิดอยู่" |
| `line/green` | `#06C755` | ปุ่ม LINE |

## ตัวอักษร (Google Fonts ทั้งหมด — โหลดด้วย `next/font/google`)

| Figma style | ฟอนต์ | น้ำหนัก | ขนาด / line-height | letter-spacing |
|---|---|---|---|---|
| Display | Bai Jamjuree | 700 | 44px / 1.18 (มือถือ 36px) | -1.5% |
| Heading/H1 | Bai Jamjuree | 700 | 30px / 1.25 | -1% |
| Heading/H2 | Bai Jamjuree | 600 | 22px / 1.3 | -0.5% |
| Body/Large | IBM Plex Sans Thai Looped | 400 | 20px / 1.65 | 0 |
| Body/Default | IBM Plex Sans Thai Looped | 400 | 18px / 1.65 | 0 |
| Body/Strong | IBM Plex Sans Thai Looped | 600 | 18px / 1.55 | 0 |
| Caption | IBM Plex Sans Thai Looped | 400 | 16px / 1.55 | 0 |
| Label | IBM Plex Sans Thai Looped | 500 | 16px / 1.4 | 0 |
| Button | Bai Jamjuree | 600 | 19px / 1.2 | 0 |
| Mono/Code | IBM Plex Mono | 600 | 17px / 1.3 | 0 |
| Mono/Big | IBM Plex Mono | 700 | 32px / 1.15 | -2% |

- เนื้อหาขั้นต่ำ 16px (ผู้สูงอายุอ่าน) ห้ามเล็กกว่านี้ยกเว้นป้ายเล็กมากในแผนที่
- IBM Plex Mono ไม่มีตัวอักษรไทย ใช้กับรหัสเคส/ตัวเลข/เวลาเท่านั้น

## รูปทรงและระยะ

- ปุ่ม: มุมมนเต็ม (`rounded-full`), สูงอย่างน้อย 48px (ปุ่มหลักบนมือถือ 56–60px)
- การ์ด: มุม 14px, กล่องย่อย 12px, เส้นขอบ 1px `border/default` หรือไม่มีขอบ
- แผ่นป๊อปอัปมือถือ (bottom sheet): มุมบน 20px
- ระยะห่างระหว่างส่วน: มือถือ 24–36px, เดสก์ท็อป 48–72px; ขอบซ้ายขวามือถือ 20–24px
- navbar: พื้น `bg/nav`, มุมล่างมน 24px (มือถือ 20px), ไม่มีเส้นขอบล่าง
- แถบสายด่วนบนสุด: พื้น `primary/700` ตัวหนังสือขาว — ปภ. 1784 · กู้ชีพ 1669 · กู้ภัย 199 (กดโทรได้ `tel:`)
- ลายประจำ: ไม้วัดระดับน้ำ (ขีดสเกลทุก 12px ขีดยาวทุก 5 และมีป้าย 0.5 ม.)
- ปุ่ม LINE: พื้น `line/green` มีโลโก้ LINE สีขาวด้านซ้าย
