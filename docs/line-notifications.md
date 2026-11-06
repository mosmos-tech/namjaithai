# TF-43: เคสของฉันและแจ้งเตือน LINE

## การผูกบัญชีและสิทธิ์

เมื่อส่ง SOS ฝั่ง API อ่าน session ที่ตรวจสอบแล้วและผูก `reporter_user_id` เอง ไม่รับเจ้าของจาก JSON ผู้ใช้ที่ไม่ล็อกอินยังแจ้งและติดตามด้วยรหัสเคส + เบอร์ 4 ตัวท้ายได้เหมือนเดิม เคส guest ที่เคยแจ้งไม่ถูกย้ายมาผูกบัญชีโดยอัตโนมัติ

`get_my_cases()` ใช้ session และ RLS คืนเฉพาะเคสที่ผู้ใช้คนนั้นแจ้ง แม้เป็นแอดมินก็ตาม เรียงล่าสุดก่อน แบ่งครั้งละ 20 รายการ หน้า `/my-cases` ตรวจ session อีกครั้งภายใน Suspense และไม่ใช้ shared cache

## การเตรียม LINE Official Account

รอบนี้สร้างระบบรองรับพร้อมทดสอบ แต่ยังไม่เปิดส่งจริง เพราะยังไม่มี OA:

1. สร้าง LINE Official Account และเปิด Messaging API โดยเลือก LINE Developers provider **เดียวกับ LINE Login** เพื่อให้ user ID ตรงกัน
2. ตั้งค่า channel access token ของ **Messaging API** ฝั่ง server เป็น `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` (ไม่ใช่ secret ของ LINE Login)
3. ตั้ง `APP_BASE_URL` เป็น canonical HTTPS origin ของเว็บ public และ `LINE_NOTIFICATIONS_SECRET` เป็นค่าสุ่มอย่างน้อย 16 ตัวอักษร ห้ามใช้ตัวแปร `NEXT_PUBLIC_` สำหรับคีย์ลับ
4. ให้ผู้ใช้เพิ่มเพื่อน OA ของโครงการก่อนรับ push message ผู้ที่บล็อก OA อาจไม่ได้รับข้อความแม้ LINE ตอบรับ API แล้ว จึงให้ติดตามผ่านเว็บได้เสมอ
5. Apply migrations ให้ครบ แล้วตั้ง scheduler ให้เรียก `POST /api/notifications/line` พร้อม `Authorization: Bearer <LINE_NOTIFICATIONS_SECRET>` ทุกนาที ห้ามใส่ secret ใน URL
6. เมื่อ OA และ scheduler พร้อมแล้ว ให้ผู้ดูแลฐานข้อมูลเปิด trigger ด้วยคำสั่งด้านล่าง ระบบจะเริ่มเก็บงานจากการเปลี่ยนสถานะครั้งถัดไป

```sql
alter table public.cases enable trigger trg_case_line_notification;
```

ตัวช่วยสำหรับ scheduler บนเครื่อง/server ที่มี `.env.local` พร้อม:

```bash
npm run notifications:line
```

คำสั่งนี้ส่งข้อความจริงเมื่อ environment พร้อมแล้ว ไม่ถูกเรียกโดยชุดทดสอบหรือเมื่อเปิดหน้าเว็บ

ไม่ได้ตั้ง Vercel cron อัตโนมัติ: ต้องเลือก scheduler ที่รองรับการทำงานทุกนาทีใน deployment ของทีมก่อนเปิดใช้งาน Vercel Hobby จำกัด cron วันละครั้ง จึงไม่เหมาะกับแจ้งเตือนสถานะ SOS ดู [ข้อจำกัด Vercel Cron](https://vercel.com/docs/cron-jobs/usage-and-pricing)

## คิวและการส่งซ้ำ

- Migration ปิด trigger ไว้เป็นค่าเริ่มต้นเพื่อหยุดสร้างงานระหว่างที่ยังไม่มี OA
- Trigger เพิ่มงานใน transaction เดียวกับการเปลี่ยน `cases.status` เฉพาะเคสที่ผูกผู้ใช้ ACTIVE และมี LINE user ID ไม่สร้างงานเมื่อเขียนสถานะเดิมซ้ำ
- ตาราง `case_line_notifications` และ RPC สำหรับ worker ไม่เปิดให้ anon/authenticated อ่านหรือเรียก
- Worker claim ได้ครั้งละ 10 งานด้วย row lock และ lease 2 นาที รับเฉพาะงานแรกที่ยังไม่จบของแต่ละเคส เพื่อรักษาลำดับสถานะ
- ทุกการส่งใช้ UUID งานเดิมเป็น `X-Line-Retry-Key` รวมถึง retry หลัง network error หรือ acknowledgement ล้มเหลว ไม่สร้าง key ใหม่เมื่อส่งซ้ำ
- LINE ตอบ 2xx หรือ 409 พร้อม accepted-request-id หมายถึง API รับคำขอแล้ว (`SENT` ในคิว) ไม่ได้ยืนยันว่าผู้ใช้เห็นข้อความ
- 429/5xx/network error ใช้ backoff เพิ่มขึ้น หยุดเมื่อพยายามครบ 5 ครั้งหรืออายุงานเกิน 23 ชั่วโมง เพื่อไม่ส่งซ้ำหลัง retry key ของ LINE หมดอายุ
- ความล้มเหลวถาวรและผู้ใช้ที่ถูกระงับหยุดส่ง เก็บเฉพาะรหัสข้อผิดพลาด ไม่บันทึก token หรือเนื้อหาตอบกลับที่อาจมีข้อมูลส่วนตัว
- เนื้อหาข้อความมีรหัสเคส สถานะ เวลาของเหตุการณ์ และลิงก์ติดตาม ไม่มีชื่อ เบอร์โทร พิกัด หรือข้อมูลสุขภาพ

เมื่อเปิดส่งจริง ให้ตั้งงานฐานข้อมูลรายวันเพื่อล้างแถวคิวที่มีอายุเกิน 30 วัน อายุนี้เผื่อช่วงตรวจสอบการส่งและยาวกว่าช่วง retry 23 ชั่วโมง

```sql
delete from public.case_line_notifications
where created_at < now() - interval '30 days'
  and (locked_until is null or locked_until < now());
```

อ้างอิง [LINE Push messages](https://developers.line.biz/en/reference/messaging-api/#send-push-message) และ [LINE retry keys](https://developers.line.biz/en/docs/messaging-api/retrying-api-request/)

## ทดสอบและก่อน release

ใช้ Vitest mock LINE HTTP responses, pgTAP ตรวจสิทธิ์/lease/ลำดับคิว และ Playwright ตรวจหน้ารายการ/การผูกบัญชี/การเข้า track/guest fallback ชุดทดสอบไม่ส่งข้อความไป LINE จริง

ก่อนเปิดจริงต้องเพิ่มเพื่อน OA ด้วยบัญชีทดสอบใน provider เดียวกัน เปลี่ยนสถานะเคสทดสอบ เรียก worker จาก scheduler และตรวจว่าข้อความเข้าบัญชีที่ถูกต้องเพียงครั้งเดียว ขั้นตอนนี้ยังต้องทำหลังทีมมี OA และตั้งค่า environment แล้ว
