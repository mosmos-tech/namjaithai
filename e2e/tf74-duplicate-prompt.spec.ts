import { expect, test, type Page } from "@playwright/test";
import {
  adminDb,
  closeTestCases,
  countCasesByPhone,
  createCaseViaApi,
  randomPhone,
  uniqueTestPoint,
} from "./helpers/db";
import { goToStep5, openFreshSosForm, expectSentCase } from "./helpers/sos";

/**
 * TF-74 ส่ง SOS ซ้ำแล้วไม่ติดตัน และไม่เห็นข้อมูลเคสของคนอื่น
 * - เบอร์เดิม + เครื่องเดิม (มี token ยืนยัน TF-58): อัปเดตเคสเดิม แล้วไปหน้าติดตามเคสนั้น
 * - เบอร์เดิม + เครื่องอื่น: ส่งเป็นรายงานเพิ่มเติม ไม่ได้รหัสเคส ไม่แก้ข้อมูลหลัก
 * - เบอร์เดิม: สร้างเคสใหม่ได้ · ใกล้กัน 50 ม. แต่คนละเบอร์: มีแค่ "ส่งคำขอของฉัน"
 * - กดรัวตอนเน็ตช้าได้เคสเดียว · หน้า /en · แถบโทรสายด่วนกดได้ตลอด
 */
const DRAFT_KEY = "namjaithai-sos-draft-v2";
const caseCodes: string[] = [];

test.afterAll(async () => {
  if (!caseCodes.length) return;
  const { data } = await adminDb().from("cases").select("id").in("case_code", caseCodes);
  await closeTestCases((data ?? []).map((row) => row.id));
});

/** เคสที่เปิดอยู่แล้ว (แจ้งผ่าน API) ที่พิกัดสุ่มของ test นี้ */
async function existingCase(baseURL: string) {
  const point = uniqueTestPoint();
  const created = await createCaseViaApi(baseURL, { ...point, landmark: "จุดเดิม TF-74" });
  caseCodes.push(created.caseCode);
  return { ...created, point };
}

/** ใส่พิกัดลงร่างฟอร์ม (ขั้น 5) */
async function seedPoint(page: Page, point: { lat: number; lng: number }, landmark: string) {
  await page.evaluate(
    ({ key, point, landmark }) => {
      const draft = JSON.parse(localStorage.getItem(key) ?? "{}");
      localStorage.setItem(key, JSON.stringify({ ...draft, ...point, accuracyM: 10, landmark }));
      window.dispatchEvent(new Event("storage"));
    },
    { key: DRAFT_KEY, point, landmark },
  );
}

/** เครื่องนี้คือเครื่องที่ส่งเคสเดิม (เก็บ token ยืนยันไว้ตอนส่ง — TF-58) */
async function rememberOnThisDevice(page: Page, caseCode: string, trackingToken: string) {
  const secret = await adminDb().rpc("confirmation_secret_for_case", { p_case_code: caseCode });
  expect(secret.error).toBeNull();
  await page.evaluate(
    (ref) => localStorage.setItem("namjaithai:confirmation-cases", JSON.stringify([ref])),
    { caseCode, trackingToken, confirmationToken: secret.data as string },
  );
}

async function fillContactAndSend(page: Page, phone: string) {
  await page.getByPlaceholder("เช่น สมชาย ใจดี (หรือชื่อเล่น)").fill("ผู้แจ้ง TF-74");
  await page.getByPlaceholder("เช่น 0812345678 หรือ 081-234-5678").fill(phone);
  await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลเพื่อ/ }).check();
  await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลสุขภาพ/ }).check();
  await page.getByTestId("step5-submit-button").click();
}

/** ฟอร์มภาษาอังกฤษถึงขั้น 5 (แบบเดียวกับ english-sos.spec.ts) */
async function goToEnglishStep5(page: Page) {
  const ip = `10.74.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  await page.route("**/api/cases", (route) =>
    route.fallback({ headers: { ...route.request().headers(), "x-forwarded-for": ip } }),
  );
  await page.goto("/en/request");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByText("Step 1 of 5")).toBeVisible();
  await expect(page.getByTestId("hydration-pending")).toHaveCount(0);
  const next = () => page.getByRole("button", { name: /^Next/ }).filter({ visible: true }).click();
  await page.getByRole("radio", { name: "Flood" }).click();
  await page.getByRole("radio", { name: "I am at the scene" }).click();
  await next();
  await expect(page.getByText("Step 2 of 5")).toBeVisible();
  await page.getByRole("checkbox", { name: "None of these" }).click();
  await page.getByRole("radio", { name: "No, I am trapped" }).click();
  await page.getByRole("radio", { name: "Waist to chest deep" }).click();
  await next();
  await expect(page.getByText("Step 3 of 5")).toBeVisible();
  await seedPoint(page, uniqueTestPoint(), "New place TF-74");
  await expect(page.locator("#sos-landmark")).toHaveValue("New place TF-74");
  await next();
  await expect(page.getByText("Step 4 of 5")).toBeVisible();
  await next();
  await expect(page.getByText("Step 5 of 5")).toBeVisible();
}

const prompt = (page: Page) => page.getByTestId("duplicate-case-prompt");

test("เบอร์เดิมจากเครื่องเดิม: อัปเดตเคสเดิมแล้วไปหน้าติดตามเคสนั้น ไม่เกิดเคสใหม่", async ({
  page,
  baseURL,
  isMobile,
}) => {
  const existing = await existingCase(baseURL!);
  await openFreshSosForm(page);
  await rememberOnThisDevice(page, existing.caseCode, existing.trackingToken);
  await goToStep5(page);
  await seedPoint(page, uniqueTestPoint(), "ย้ายไปชั้นสองแล้ว TF-74");
  await fillContactAndSend(page, existing.phone);

  await expect(prompt(page)).toContainText("เบอร์นี้มีคำขอที่ยังเปิดอยู่");
  await expect(prompt(page)).not.toContainText(existing.caseCode);
  // แถบโทรสายด่วนยังกดได้ระหว่างที่กล่องถามขึ้น
  const call = page.getByRole("link", {
    name: isMobile ? "โทรสายด่วนกู้ชีพ 1669" : "กู้ชีพ 1669",
    exact: true,
  });
  await expect(call).toHaveAttribute("href", "tel:1669");
  await call.click({ trial: true });

  await prompt(page).getByRole("button", { name: "อัปเดตเคสเดิม" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/track/${existing.caseCode}\\?t=${existing.trackingToken}$`),
  );
  const { data } = await adminDb()
    .from("cases")
    .select("landmark")
    .eq("case_code", existing.caseCode)
    .single()
    .throwOnError();
  expect(data!.landmark).toBe("ย้ายไปชั้นสองแล้ว TF-74");
  expect(await countCasesByPhone(existing.phone)).toBe(1);
});

test("เบอร์เดิมจากเครื่องอื่น: ส่งเป็นรายงานเพิ่มเติม ไม่ได้รหัสเคส และข้อมูลหลักไม่เปลี่ยน", async ({
  page,
  baseURL,
}) => {
  const existing = await existingCase(baseURL!);
  await openFreshSosForm(page);
  await goToStep5(page);
  await seedPoint(page, uniqueTestPoint(), "ที่อื่น TF-74");
  await fillContactAndSend(page, existing.phone);
  await prompt(page).getByRole("button", { name: "อัปเดตเคสเดิม" }).click();

  await expect(page.getByTestId("step5-submit-success")).toContainText(
    "ส่งข้อมูลเพิ่มให้ทีมแล้ว ถ้าต้องการติดตามเคส ใช้รหัสที่ได้ตอนแจ้งครั้งแรก",
  );
  await expect(page.getByText(existing.caseCode)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "ดูรายละเอียดการแจ้งและติดตามเคส" })).toHaveCount(0);
  const { data: original } = await adminDb()
    .from("cases")
    .select("id, landmark, lat, lng")
    .eq("case_code", existing.caseCode)
    .single()
    .throwOnError();
  expect(original).toMatchObject({ landmark: "จุดเดิม TF-74", ...existing.point });
  const { data: supplements } = await adminDb()
    .from("case_reporter_supplements")
    .select("report")
    .eq("case_id", original!.id)
    .throwOnError();
  expect(supplements).toHaveLength(1);
  expect(await countCasesByPhone(existing.phone)).toBe(1);
});

test("เบอร์เดิม: กดสร้างเคสใหม่รัวตอนเน็ตช้า ได้เคสใหม่เคสเดียว", async ({ page, baseURL }) => {
  const existing = await existingCase(baseURL!);
  await openFreshSosForm(page);
  await goToStep5(page);
  await seedPoint(page, uniqueTestPoint(), "เหตุใหม่ TF-74");
  await fillContactAndSend(page, existing.phone);
  await expect(prompt(page)).toBeVisible();

  // คำขอหลังเลือกทางช้า 2 วินาที (เน็ตช้า) — ระหว่างนี้กดซ้ำ
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/cases", async (route) => {
    await gate;
    await route.fallback();
  });
  const createNew = page.getByTestId("duplicate-create-new-button");
  await expect(createNew).toHaveText("สร้างเคสใหม่");
  // ดับเบิลคลิก แล้วกดซ้ำอีกครั้งระหว่างที่คำขอแรกยังค้าง (ปุ่มปิดอยู่ ยิง click ตรงที่ element)
  await createNew.dblclick();
  await expect(createNew).toHaveText("กำลังส่ง…");
  await expect(createNew).toBeDisabled();
  await createNew.dispatchEvent("click");
  release();
  const code = await expectSentCase(page);
  caseCodes.push(code);
  expect(code).not.toBe(existing.caseCode);
  expect(await countCasesByPhone(existing.phone)).toBe(2);
});

test("ใกล้กัน 50 ม. แต่คนละเบอร์: เห็นแค่ปุ่มส่งคำขอของฉัน ไม่เห็นข้อมูลเคสของคนอื่น", async ({
  page,
  baseURL,
}) => {
  const existing = await existingCase(baseURL!);
  await openFreshSosForm(page);
  await goToStep5(page);
  await seedPoint(page, existing.point, "บ้านข้างๆ TF-74");
  const phone = randomPhone();
  await fillContactAndSend(page, phone);

  await expect(prompt(page)).toContainText("มีคนแจ้งเหตุใกล้คุณแล้ว");
  await expect(prompt(page)).toContainText("ทีมกู้ภัยจะเห็นทั้งสองเคส");
  await expect(prompt(page).getByRole("button", { name: "อัปเดตเคสเดิม" })).toHaveCount(0);
  await expect(page.getByText(existing.caseCode)).toHaveCount(0);
  await prompt(page).getByRole("button", { name: "ส่งคำขอของฉัน" }).click();
  caseCodes.push(await expectSentCase(page));
  expect(await countCasesByPhone(phone)).toBe(1);
});

test("หน้า /en: กล่องถามเป็นภาษาอังกฤษ และสร้างคำขอใหม่ได้", async ({ page, baseURL }) => {
  const existing = await existingCase(baseURL!);
  await goToEnglishStep5(page);
  await page.getByLabel(/^Your name or a contact name/).fill("Tourist TF-74");
  await page.getByLabel(/^Phone number to call you back/).fill(existing.phone);
  await page.getByRole("checkbox", { name: /^I consent to the use of my information/ }).check();
  await page.getByRole("checkbox", { name: /^I consent to the use of health information/ }).check();
  await page.getByRole("button", { name: "Request help now" }).click();

  await expect(prompt(page)).toContainText("This phone number already has an open request");
  await expect(prompt(page)).not.toContainText(existing.caseCode);
  await prompt(page).getByRole("button", { name: "Create a new request" }).click();
  await expectSentCase(page);
  expect(await countCasesByPhone(existing.phone)).toBe(2);
  const { data } = await adminDb()
    .from("cases")
    .select("case_code, case_contacts!inner(phone)")
    .eq("case_contacts.phone", existing.phone)
    .neq("case_code", existing.caseCode)
    .throwOnError();
  caseCodes.push(...(data ?? []).map((row) => row.case_code));
});
