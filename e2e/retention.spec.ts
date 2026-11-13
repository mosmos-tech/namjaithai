import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { adminDb } from "./helpers/db";

test("TF-44 ปิดบังเคสเก่าและลบไฟล์จริงผ่าน worker ที่ต้องยืนยันสิทธิ์", async ({
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "ทดสอบ API และ Storage เพียงครั้งเดียวต่อฐานทดสอบ",
  );
  test.setTimeout(90_000);
  const db = adminDb();
  const id = randomUUID();
  const path = `${id}/${"a".repeat(64)}.jpg`;
  const bucket = db.storage.from("case-media");
  const inserted = await db.from("cases").insert({
    id,
    case_code: `TF44-E2E-${id}`,
    status: "RESOLVED",
    urgency: "GREEN",
    lat: 13.75,
    lng: 100.5,
    landmark: "ที่อยู่ส่วนตัว",
    notes: "ข้อมูลส่วนตัว",
    incident_type: "FLOOD",
    closed_at: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString(),
  });
  expect(inserted.error).toBeNull();
  const upload = await bucket.upload(path, Buffer.from("TF44 synthetic image"), {
    contentType: "image/jpeg",
  });
  expect(upload.error).toBeNull();
  const media = await db
    .from("case_media")
    .insert({ case_id: id, storage_path: path, mime_type: "image/jpeg", file_size_bytes: 20 });
  expect(media.error).toBeNull();
  const purge = await db.rpc("purge_closed_case_pii");
  expect(purge.error).toBeNull();
  expect((await bucket.exists(path)).data).toBe(true);

  expect((await request.post("/api/retention/media")).status()).toBe(401);
  expect((await bucket.exists(path)).data).toBe(true);
  const worker = await request.post("/api/retention/media", {
    headers: { Authorization: `Bearer ${process.env.RETENTION_WORKER_SECRET}` },
  });
  expect(worker.status()).toBe(200);
  expect((await worker.json()).deleted).toBeGreaterThanOrEqual(1);
  expect((await bucket.exists(path)).data).toBe(false);
  expect((await bucket.remove([path])).error).toBeNull(); // ลองซ้ำได้หากตอบรับผลในฐานข้อมูลไม่สำเร็จ
  const stored = await db
    .from("cases")
    .select("lat,lng,landmark,notes,pii_redacted_at")
    .eq("id", id)
    .single();
  expect(stored.error).toBeNull();
  expect(stored.data).toMatchObject({
    lat: null,
    lng: null,
    landmark: "[ลบข้อมูลส่วนบุคคลแล้ว]",
    notes: null,
  });
  expect(stored.data?.pii_redacted_at).toBeTruthy();
});
