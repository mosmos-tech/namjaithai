import { adminDb } from "./helpers/db";

/**
 * ก่อนรัน E2E ทุกครั้ง: ล้างตัวนับ rate limit ของการส่ง SOS/ติดตามเคส ในฐานข้อมูลในเครื่อง
 * ไม่งั้นรัน test ซ้ำหลายรอบใน 1 ชม. จะชนเพดาน IP ละ 20 เคส (TF-12) แล้วล้มแบบไม่เกี่ยวกับโค้ด
 */
export default async function globalSetup() {
  const { error } = await adminDb().from("sos_rate_limit_hits").delete().gte("id", 0);
  if (error) throw new Error(`ล้าง rate limit ไม่สำเร็จ: ${error.message}`);
}
