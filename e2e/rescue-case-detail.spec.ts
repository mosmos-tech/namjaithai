import { expect, test } from "@playwright/test";
import { adminDb } from "./helpers/db";
import { applySession, createAccount, type TestAccount } from "./helpers/accounts";

test.describe.configure({ mode: "serial" });
let owner: TestAccount;
let colleague: TestAccount;
let caseId: string;
let newCaseId: string;
let unitId: string;
let caseCode: string;

test.beforeAll(async ({}, testInfo) => {
  const db = adminDb();
  const tag = `TF24${testInfo.project.name[0]}${crypto.randomUUID().slice(0, 8)}`;
  owner = await createAccount({ displayName: `${tag} ผู้รับ`, role: "RESCUER" });
  colleague = await createAccount({ displayName: `${tag} สมาชิก`, role: "RESCUER" });
  const { data: unit } = await db
    .from("units")
    .insert({ name: tag, province: "เลย" })
    .select("id")
    .single()
    .throwOnError();
  unitId = unit!.id;
  await db
    .from("unit_members")
    .insert(
      [owner, colleague].map((user) => ({
        unit_id: unitId,
        user_id: user.id,
        role_in_unit: "MEMBER",
        status: "APPROVED",
      })),
    )
    .throwOnError();
  caseCode = `${tag}-ACCEPTED`;
  const { data: item } = await db
    .from("cases")
    .insert({
      case_code: caseCode,
      urgency: "RED",
      status: "ACCEPTED",
      lat: 17.49,
      lng: 101.72,
      province: "เลย",
      landmark: "จุดทดสอบ TF24",
      incident_type: "FLOOD",
      details: { waterLevel: "ROOF", canSelfEvacuate: false },
      assigned_unit_id: unitId,
      assigned_rescuer_id: owner.id,
    })
    .select("id")
    .single()
    .throwOnError();
  caseId = item!.id;
  const { data: waiting } = await db
    .from("cases")
    .insert({
      case_code: `${tag}-NEW`,
      urgency: "YELLOW",
      lat: 17.49,
      lng: 101.72,
      province: "เลย",
      landmark: "รอรับ TF24",
      created_at: new Date(Date.now() - 135 * 60_000).toISOString(),
    })
    .select("id")
    .single()
    .throwOnError();
  newCaseId = waiting!.id;
  await db
    .from("case_contacts")
    .insert({
      case_id: caseId,
      name: "ผู้แจ้ง TF24",
      phone: "0891234524",
      phone_last4: "4524",
      line_id: "tf24-test",
    })
    .throwOnError();
  await db
    .from("case_sensitive_details")
    .insert({ case_id: caseId, details: { hasInjured: true, dangerSigns: ["UNCONSCIOUS"] } })
    .throwOnError();
  await db.from("case_events").insert({ case_id: caseId, event_type: "CREATED" }).throwOnError();
});

test.afterAll(async () => {
  // case_events and audit_logs are append-only, so leave these synthetic records in the disposable E2E database.
  const db = adminDb();
  if (caseId && newCaseId)
    await db.from("cases").update({ status: "RESOLVED" }).in("id", [caseId, newCaseId]);
  if (unitId) await db.from("units").update({ is_active: false }).eq("id", unitId);
  if (owner && colleague)
    await db.from("users").update({ status: "SUSPENDED" }).in("id", [owner.id, colleague.id]);
});

test("ผู้รับเคสดูรายละเอียด นำทาง เปิดเบอร์และบันทึก audit", async ({ page, context }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await applySession(context, owner);
  await page.goto(`/rescue/cases/${caseId}`);
  await expect(page.getByText(caseCode)).toBeVisible();
  await expect(page.getByRole("link", { name: "นำทางไปจุดเกิดเหตุ" })).toHaveAttribute(
    "href",
    "https://www.google.com/maps/dir/?api=1&destination=17.49,101.72",
  );
  await expect(page.getByText("มีคนหมดสติ")).toBeVisible();
  await expect(page.getByRole("heading", { name: "ไทม์ไลน์" })).toBeVisible();
  await expect(page.getByRole("form", { name: "ปรับระดับความเร่งด่วน" })).toBeVisible();
  await expect(page.getByText("0891234524")).toHaveCount(0);
  await page.getByRole("button", { name: "แสดงเบอร์โทร" }).click();
  await expect(page.getByRole("link", { name: "โทร 0891234524" })).toBeVisible();
  await expect(page.getByRole("link", { name: /ติดต่อ LINE/ })).toBeVisible();
  const { count } = await adminDb()
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("case_id", caseId)
    .eq("action", "CASE_CONTACT_REVEALED");
  expect(count).toBe(1);
  const override = page.getByRole("form", { name: "ปรับระดับความเร่งด่วน" });
  await override.getByText("เร่งด่วน", { exact: true }).click();
  await override.getByLabel("เหตุผล (บังคับ)").fill("ตรวจสอบสถานการณ์แล้วอาการคงที่");
  await override.getByRole("button", { name: "บันทึกการปรับระดับ" }).click();
  await expect(page.getByText("ปรับระดับแล้ว บันทึกเหตุผลไว้ในประวัติ")).toBeVisible();
  await expect
    .poll(async () => {
      const { data } = await adminDb().from("cases").select("urgency").eq("id", caseId).single();
      return data?.urgency;
    })
    .toBe("YELLOW");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("ผู้ไม่ได้รับเคสไม่เห็นเบอร์หรือข้อมูลสุขภาพ และเคสใหม่แสดงเวลารอ", async ({
  page,
  context,
}) => {
  await applySession(context, colleague);
  await page.goto(`/rescue/cases/${caseId}`);
  await expect(page.getByText(caseCode)).toBeVisible();
  await expect(page.getByRole("button", { name: "แสดงเบอร์โทร" })).toHaveCount(0);
  await expect(page.getByText("มีคนหมดสติ")).toHaveCount(0);
  await expect(page.getByRole("form", { name: "ปรับระดับความเร่งด่วน" })).toHaveCount(0);
  await page.goto(`/rescue/cases/${newCaseId}`);
  await expect(page.getByTestId("case-wait")).toContainText("รอมาแล้ว 2 ชม.");
});
