import { expect, test, type Page } from "@playwright/test";
import { applySession, createAccount, type TestAccount } from "./helpers/accounts";
import { adminDb, closeTestCases, randomPhone } from "./helpers/db";
import { saveEvidence } from "./helpers/evidence";
import { goToStep5, openFreshSosForm, expectSentCase } from "./helpers/sos";

/**
 * TF-39 เกณฑ์ขอบเขตข้อ 8: เส้นทางเต็มผ่านหน้าจอจริงทั้งสองฝั่ง
 * ผู้แจ้งส่ง SOS จากฟอร์ม → กู้ภัยกดรับ → เริ่มเดินทาง → ถึงที่เกิดเหตุ → ช่วยเสร็จแล้ว
 * → ผู้แจ้งกด "ฉันได้รับความช่วยเหลือแล้ว" จากเครื่องที่ส่ง → RESOLVED แบบ REPORTER_CONFIRMED
 * หน่วยสร้างหลังรู้จังหวัดของเคส (ระบบหาจังหวัดจากพิกัดเอง) จึงไม่ชนกับ test อื่น
 */
let rescuer: TestAccount | undefined;
let unitId: string | undefined;
let caseId: string | undefined;

test.afterAll(async () => {
  const db = adminDb();
  if (caseId) await closeTestCases([caseId]);
  if (unitId) await db.from("units").update({ is_active: false }).eq("id", unitId);
  if (rescuer) await db.from("users").update({ status: "SUSPENDED" }).eq("id", rescuer.id);
});

async function expectTrackTitle(page: Page, title: string) {
  await page.reload();
  await expect(page.getByTestId("track-panel").getByRole("heading", { level: 1 })).toHaveText(
    title,
  );
}

test("ส่ง SOS → รับเคส → เดินทาง → ถึง → ช่วยเสร็จ → ผู้แจ้งยืนยัน ปิดเคสแบบ REPORTER_CONFIRMED", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(90_000);
  const tag = `TF39J${testInfo.project.name[0]}${crypto.randomUUID().slice(0, 6)}`;
  const db = adminDb();

  // 1) ผู้แจ้งส่ง SOS จากฟอร์ม 5 ขั้น แล้วไปหน้าติดตาม
  await openFreshSosForm(page);
  await goToStep5(page);
  await page.getByPlaceholder("เช่น สมชาย ใจดี (หรือชื่อเล่น)").fill(`${tag} ผู้แจ้ง`);
  await page.getByPlaceholder("เช่น 0812345678 หรือ 081-234-5678").fill(randomPhone());
  await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลเพื่อ/ }).check();
  await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลสุขภาพ/ }).check();
  const submitted = page.waitForResponse(
    (res) => res.url().includes("/api/cases") && res.request().method() === "POST",
  );
  await page.getByTestId("step5-submit-button").click();
  const response = await submitted;
  expect(response.status()).toBe(201);
  const { caseCode } = (await response.json()) as { caseCode: string };
  const { data: created } = await db
    .from("cases")
    .select("id, province")
    .eq("case_code", caseCode)
    .single()
    .throwOnError();
  caseId = created!.id;

  // TF-80: ส่งสำเร็จแล้วไปหน้ารหัสเคสใหญ่เอง แล้วกด "ติดตามเคส"
  await expectSentCase(page, caseCode);
  await page
    .getByTestId("sent-case-card")
    .getByRole("link", { name: "ติดตามเคส", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/track/${caseCode}\\?t=`));
  await expect(page.getByTestId("track-panel").getByRole("heading", { level: 1 })).toHaveText(
    "กำลังหาทีมกู้ภัยที่ใกล้คุณที่สุด",
  );

  // 2) กู้ภัยหน่วยในจังหวัดของเคสกดรับ แล้วเลื่อนสถานะทีละขั้นจากหน้างานของฉัน
  rescuer = await createAccount({ displayName: `${tag} กู้ภัย`, role: "RESCUER" });
  const { data: unit } = await db
    .from("units")
    .insert({ name: `${tag} หน่วย`, province: created!.province })
    .select("id")
    .single()
    .throwOnError();
  unitId = unit!.id;
  await db
    .from("unit_members")
    .insert({ unit_id: unitId, user_id: rescuer.id, role_in_unit: "MEMBER", status: "APPROVED" })
    .throwOnError();
  const rescuerContext = await browser.newContext({ ...testInfo.project.use });
  await applySession(rescuerContext, rescuer);
  const rescue = await rescuerContext.newPage();

  await rescue.goto(`/rescue/cases/${caseId}`);
  await rescue.getByRole("button", { name: "รับเคสนี้" }).click();
  await expect(rescue.getByText("สถานะ: รับเคสแล้ว")).toBeVisible();
  await expectTrackTitle(page, "ทีมกู้ภัยรับเคสของคุณแล้ว");
  await expect(page.getByTestId("track-panel")).toContainText(`${tag} หน่วย`);

  await rescue.goto("/rescue/my-tasks");
  const card = rescue.getByTestId("my-task-card").filter({ hasText: caseCode });
  await card.getByRole("button", { name: "เริ่มเดินทาง" }).click();
  await expect(card.getByTestId("my-task-status")).toHaveText("กำลังเดินทาง");
  await expectTrackTitle(page, "ทีมกู้ภัยกำลังมาหาคุณ");

  await card.getByRole("button", { name: "ถึงที่เกิดเหตุ" }).click();
  await expect(card.getByTestId("my-task-status")).toHaveText("ถึงจุดเกิดเหตุ");
  await expectTrackTitle(page, "ทีมกู้ภัยถึงจุดของคุณแล้ว");

  await card.getByRole("button", { name: "ช่วยเสร็จแล้ว" }).click();
  await card.getByRole("radio", { name: "ช่วยได้" }).check();
  await card.getByLabel("จำนวนคนที่ช่วยได้").fill("1");
  await card.getByRole("button", { name: "ยืนยัน ช่วยเสร็จแล้ว" }).click();
  await expect(card.getByTestId("my-task-status")).toHaveText("รอผู้แจ้งยืนยัน");

  // 3) ผู้แจ้งยืนยันจากเครื่องที่ส่ง SOS (เก็บ token ยืนยันไว้ตอนส่ง — TF-58)
  await expectTrackTitle(page, "ทีมแจ้งว่าช่วยเหลือเสร็จแล้ว");
  const confirmRegion = page.getByRole("region", { name: "ยืนยันการช่วยเหลือ" });
  await saveEvidence(page, "8-reporter-confirm-button", testInfo);
  await confirmRegion.getByRole("button", { name: "ฉันได้รับความช่วยเหลือแล้ว" }).click();
  await expect(confirmRegion).toHaveCount(0);
  await expectTrackTitle(page, "ช่วยเหลือสำเร็จแล้ว");
  await saveEvidence(page, "8-case-resolved", testInfo);

  const { data: closed } = await db
    .from("cases")
    .select("status, close_confirmation, assigned_unit_id")
    .eq("id", caseId)
    .single()
    .throwOnError();
  expect(closed).toEqual({
    status: "RESOLVED",
    close_confirmation: "REPORTER_CONFIRMED",
    assigned_unit_id: unitId,
  });
  // ผ่านครบทุกขั้นตามลำดับ (ข้ามขั้นไม่ได้ — TF-26)
  const { data: events } = await db
    .from("case_events")
    .select("to_status")
    .eq("case_id", caseId)
    .not("to_status", "is", null)
    .order("created_at")
    .throwOnError();
  // (เหตุการณ์สร้างเคสมี to_status = NEW — ไม่นับ)
  expect(events!.map((event) => event.to_status).filter((status) => status !== "NEW")).toEqual([
    "ACCEPTED",
    "EN_ROUTE",
    "ON_SITE",
    "AWAITING_CONFIRMATION",
    "RESOLVED",
  ]);
  await rescuerContext.close();
});
