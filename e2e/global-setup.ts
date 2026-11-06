import { adminDb, setTestOnlyIncidentTypes } from "./helpers/db";

/**
 * ก่อนรัน E2E ทุกครั้ง: ล้างตัวนับ rate limit ของการส่ง SOS/ติดตามเคส ในฐานข้อมูลในเครื่อง
 * ไม่งั้นรัน test ซ้ำหลายรอบใน 1 ชม. จะชนเพดาน IP ละ 20 เคส (TF-12) แล้วล้มแบบไม่เกี่ยวกับโค้ด
 */
export default async function globalSetup() {
  // จุดเริ่มของตารางพิกัด test รอบนี้ (ดู uniqueTestPoint) — worker ทุกตัวได้ค่าเดียวกันผ่าน env
  process.env.E2E_LOCATION_SEED ??= String(Math.floor(Math.random() * 1800 * 1800));

  const { error } = await adminDb().from("sos_rate_limit_hits").delete().gte("id", 0);
  if (error) throw new Error(`ล้าง rate limit ไม่สำเร็จ: ${error.message}`);

  // ประเภทเหตุที่ยังรอ TF-54 ตรวจเนื้อหาปิดอยู่ แต่ E2E ของ TF-51 ต้องส่งเคสได้ — เปิดเฉพาะตอนรัน test
  await setTestOnlyIncidentTypes(true);
}
