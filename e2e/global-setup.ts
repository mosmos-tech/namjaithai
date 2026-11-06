import { adminDb } from "./helpers/db";

/**
 * ก่อนรัน E2E ทุกครั้ง: ล้างตัวนับ rate limit ของการส่ง SOS/ติดตามเคส ในฐานข้อมูลในเครื่อง
 * ไม่งั้นรัน test ซ้ำหลายรอบใน 1 ชม. จะชนเพดาน IP ละ 20 เคส (TF-12) แล้วล้มแบบไม่เกี่ยวกับโค้ด
 */
export default async function globalSetup() {
  // จุดเริ่มของตารางพิกัด test รอบนี้ (ดู uniqueTestPoint) — worker ทุกตัวได้ค่าเดียวกันผ่าน env
  process.env.E2E_LOCATION_SEED ??= String(Math.floor(Math.random() * 1800 * 1800));

  const db = adminDb();
  const { error } = await db.from("sos_rate_limit_hits").delete().gte("id", 0);
  if (error) throw new Error(`ล้าง rate limit ไม่สำเร็จ: ${error.message}`);

  // TF-51 ทดสอบแบบฟอร์มประเภทที่ยังไม่เปิดใช้งานจริง เฉพาะฐานข้อมูลท้องถิ่น
  const codes = ["ROAD_ACCIDENT", "ANIMAL"];
  const { data: original, error: readError } = await db
    .from("incident_types").select("code, is_enabled").in("code", codes);
  if (readError || original?.length !== codes.length) {
    throw new Error(`อ่านสถานะประเภทเหตุทดสอบไม่สำเร็จ: ${readError?.message ?? "ข้อมูลไม่ครบ"}`);
  }
  const restore = async () => {
    for (const row of original) {
      const { error: restoreError } = await db.from("incident_types")
        .update({ is_enabled: row.is_enabled }).eq("code", row.code);
      if (restoreError) throw new Error(`คืนสถานะประเภทเหตุทดสอบไม่สำเร็จ: ${restoreError.message}`);
    }
  };
  const { error: enableError } = await db.from("incident_types")
    .update({ is_enabled: true }).in("code", codes);
  if (enableError) {
    await restore();
    throw new Error(`เตรียมประเภทเหตุทดสอบไม่สำเร็จ: ${enableError.message}`);
  }
  return restore;
}
