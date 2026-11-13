import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { adminDb } from "./helpers/db";
import { applySession, createAccount } from "./helpers/accounts";

// วันที่สุ่มในอนาคตไกล (ไม่ชนกับ TF-33 ที่ใช้ปี 2200–2299) เพื่อไม่ปนข้อมูลของ test อื่นที่รันพร้อมกัน
function uniqueDate() {
  const year = 2300 + Math.floor(Math.random() * 100);
  const month = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
  const day = String(1 + Math.floor(Math.random() * 28)).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const HEADER =
  "รหัสเคส,วันเวลาแจ้ง (เวลาไทย),ประเภทเหตุ,ระดับความเร่งด่วน,สถานะ,จังหวัด,อำเภอ,ตำบล,หน่วยที่รับ,เวลาที่ปิด (เวลาไทย),วิธีปิด,ภาษาผู้แจ้ง";

test("TF-38 แอดมินดาวน์โหลด CSV ตามตัวกรอง หัวคอลัมน์ไทย ไม่มีข้อมูลส่วนตัว และมี audit", async ({
  page,
  context,
}, info) => {
  const admin = await createAccount({ displayName: "TF38 admin", role: "ADMIN" });
  const date = uniqueDate();
  const tag = crypto.randomUUID().slice(0, 8);
  const db = adminDb();
  const { data: demoUnit } = await db
    .from("units")
    .insert({ name: `TF38 ${tag} หน่วยตัวอย่าง`, province: "จันทบุรี", source: "DEMO" })
    .select("id")
    .single()
    .throwOnError();
  // TF-39: เคสทดสอบเป็นเคสที่ปิดแล้ว ไม่ไปโผล่ในรายการ/แผนที่ของกู้ภัยที่ test อื่นนับจำนวนอยู่
  const { data: cases } = await db
    .from("cases")
    .insert([
      {
        case_code: `TF38-${tag}-1`,
        urgency: "RED",
        status: "RESOLVED",
        lat: 12.6111,
        lng: 102.1111,
        landmark: `TF38 จุดลับ ${tag}`,
        notes: `TF38 โน้ตลับ ${tag}`,
        province: "จันทบุรี",
        district: "เมืองจันทบุรี",
        incident_type: "FLOOD",
        created_at: `${date}T02:00:00Z`,
        is_demo: false,
      },
      {
        case_code: `TF38-${tag}-2`,
        urgency: "GREEN",
        status: "RESOLVED",
        lat: 12.6,
        lng: 102.1,
        landmark: "TF38",
        province: "จันทบุรี",
        incident_type: "FIRE",
        created_at: `${date}T03:00:00Z`,
        is_demo: false,
      },
      {
        case_code: `TF38-${tag}-DEMO`,
        urgency: "RED",
        status: "RESOLVED",
        lat: 12.6,
        lng: 102.1,
        landmark: "TF38",
        province: "จันทบุรี",
        incident_type: "FLOOD",
        created_at: `${date}T04:00:00Z`,
        is_demo: true,
        assigned_unit_id: demoUnit!.id,
      },
    ])
    .select("id, case_code")
    .throwOnError();
  const first = cases!.find((c) => c.case_code === `TF38-${tag}-1`)!;
  await db
    .from("case_contacts")
    .insert({ case_id: first.id, name: `ผู้แจ้ง ${tag}`, phone: "0893800038", phone_last4: "0038" })
    .throwOnError();

  await applySession(context, admin);
  if (info.project.name === "mobile") await page.setViewportSize({ width: 375, height: 812 });

  // ไม่เลือกช่วงวันที่ → กลับมาหน้าเดิมพร้อมข้อความ
  await page.goto("/admin");
  const region = page.getByRole("region", { name: "สถิติห้องสั่งการ" });
  await region.getByTestId("case-export-button").click();
  await expect(page.getByTestId("case-export-error")).toHaveText(
    "กรุณาเลือกช่วงวันที่ (ตั้งแต่ และ ถึง) ให้ถูกต้องก่อนดาวน์โหลด",
  );

  await region
    .getByRole("combobox", { name: "จังหวัดของสถิติ", exact: true })
    .selectOption("จันทบุรี");
  await region.getByRole("combobox", { name: "ประเภทเหตุ", exact: true }).selectOption("FLOOD");
  await region.getByLabel("ตั้งแต่วันที่").fill(date);
  await region.getByLabel("ถึงวันที่").fill(date);
  const downloading = page.waitForEvent("download");
  await region.getByTestId("case-export-button").click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe(`cases-${date}_${date}.csv`);
  const body = await readFile((await download.path())!);
  expect([...body.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const lines = body.toString("utf8").replace(/^﻿/, "").trimEnd().split("\r\n");
  expect(lines[0]).toBe(HEADER);
  // เฉพาะน้ำท่วมของจังหวัดที่เลือก ไม่รวมเคสตัวอย่าง
  expect(lines).toEqual([
    HEADER,
    `TF38-${tag}-1,${date} 09:00,น้ำท่วม,แดง,ช่วยเหลือสำเร็จ,จันทบุรี,เมืองจันทบุรี,,,,,ไทย`,
  ]);
  const text = lines.join("\n");
  for (const secret of [
    `ผู้แจ้ง ${tag}`,
    "0893800038",
    `จุดลับ ${tag}`,
    `โน้ตลับ ${tag}`,
    "12.6111",
  ]) {
    expect(text, secret).not.toContain(secret);
  }

  const { data: logs } = await db
    .from("audit_logs")
    .select("metadata, target_type")
    .eq("action", "CASES_EXPORTED")
    .eq("actor_user_id", admin.id)
    .throwOnError();
  expect(logs).toEqual([
    {
      target_type: "case_export",
      metadata: { from: date, to: date, province: "จันทบุรี", incidentType: "FLOOD", rowCount: 1 },
    },
  ]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
});

test("TF-38 กู้ภัยดาวน์โหลด CSV รายการเคสไม่ได้ (ตรวจสิทธิ์ฝั่งเซิร์ฟเวอร์)", async ({
  page,
  context,
}) => {
  const rescuer = await createAccount({ displayName: "TF38 rescuer", role: "RESCUER" });
  await applySession(context, rescuer);
  const date = uniqueDate();
  const res = await page.request.get(`/api/admin/cases/export?from=${date}&to=${date}`, {
    maxRedirects: 0,
  });
  expect(res.status()).toBe(403);
  expect(res.headers()["content-type"]).not.toContain("text/csv");
  const { data: logs } = await adminDb()
    .from("audit_logs")
    .select("id")
    .eq("action", "CASES_EXPORTED")
    .eq("actor_user_id", rescuer.id)
    .throwOnError();
  expect(logs).toEqual([]);
});
