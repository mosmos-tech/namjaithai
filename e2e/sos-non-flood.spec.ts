import { test, expect } from "@playwright/test";
import { saveEvidence } from "./helpers/evidence";
import { adminDb, randomPhone } from "./helpers/db";
import {
  answerDangerQuestions,
  expectStep,
  nextButton,
  openFreshSosForm,
  seedLocationIntoDraft,
  expectSentCase,
} from "./helpers/sos";

// TF-66: ส่ง SOS ประเภทที่ไม่ใช่น้ำท่วมครบ 5 ขั้นตามลำดับใหม่
// ไฟไหม้ยังปิดอยู่ในฐานข้อมูลจริง (TF-53) — test เปิดเองตอนเริ่มและคืนค่าเดิมตอนจบ
const TYPE = "FIRE";
let originalEnabled: boolean;

// รันโปรเจกต์เดียว (มือถือ iPhone SE กว้าง 375px) ไม่ให้ 2 worker เปิด/คืนค่าประเภทเหตุทับกัน
test.skip(({ isMobile }) => !isMobile, "ทดสอบบนจอมือถือ 375px เท่านั้น");

test.beforeAll(async () => {
  const { data } = await adminDb()
    .from("incident_types")
    .select("is_enabled")
    .eq("code", TYPE)
    .single()
    .throwOnError();
  originalEnabled = data!.is_enabled;
  await adminDb()
    .from("incident_types")
    .update({ is_enabled: true })
    .eq("code", TYPE)
    .throwOnError();
});

test.afterAll(async () => {
  await adminDb()
    .from("incident_types")
    .update({ is_enabled: originalEnabled })
    .eq("code", TYPE)
    .throwOnError();
});

test("TF-66: ส่ง SOS ไฟไหม้ครบ 5 ขั้น — คำถามเฉพาะประเภทอยู่ขั้น 2 และเก็บลงเคสถูกประเภท", async ({
  page,
}) => {
  await openFreshSosForm(page);

  // ขั้น 1: เกิดเหตุอะไร
  const fire = page.getByTestId(`incident-type-${TYPE}`);
  await expect(fire).toBeVisible();
  await fire.click();
  await page.getByRole("radio", { name: "อยู่ที่จุดเกิดเหตุ", exact: true }).click();
  await nextButton(page).click();
  await expectStep(page, 2);

  // ขั้น 2: รายละเอียดเหตุ — อันตราย + คำถามไฟไหม้ + ตัวนับคน (หัวข้อตามประเภท)
  await answerDangerQuestions(page, { canSelfEvacuate: false });
  await expect(page.getByRole("heading", { name: "รายละเอียดเหตุไฟไหม้" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /จำนวนผู้ติดค้าง/ })).toBeVisible();
  await expect(page.getByRole("radio", { name: "ระดับเอว–หน้าอก" })).toHaveCount(0);
  await page.getByTestId("question-fireLocation-option-HOUSE").click();
  await page.getByTestId("question-isTrappedInSmoke-no").click();
  await nextButton(page).click();
  await expectStep(page, 3);

  // ขั้น 3–4
  await seedLocationIntoDraft(page);
  await nextButton(page).click();
  await expectStep(page, 4);
  await expect(page.getByTestId("need-option-EVACUATION_BOAT")).toHaveCount(0);
  await nextButton(page).click();
  await expectStep(page, 5);

  // ขั้น 5: ติดต่อแล้วส่ง
  const phone = randomPhone();
  await page.getByPlaceholder("เช่น สมชาย ใจดี (หรือชื่อเล่น)").fill("ผู้แจ้ง ไฟไหม้");
  await page.getByPlaceholder("เช่น 0812345678 หรือ 081-234-5678").fill(phone);
  await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลเพื่อ/ }).check();
  await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลสุขภาพ/ }).check();
  const responsePromise = page.waitForResponse(
    (r) => r.url().endsWith("/api/cases") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "แจ้งขอความช่วยเหลือทันที" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const { caseCode } = (await response.json()) as { caseCode: string };
  await expectSentCase(page, caseCode);
  await saveEvidence(page, "6-non-flood-fire-sent", test.info());

  const { data: created } = await adminDb()
    .from("cases")
    .select("incident_type, details")
    .eq("case_code", caseCode)
    .single()
    .throwOnError();
  expect(created!.incident_type).toBe(TYPE);
  expect(created!.details).toMatchObject({ fireLocation: "HOUSE", isTrappedInSmoke: false });
  expect(created!.details).not.toHaveProperty("waterLevel");
});
