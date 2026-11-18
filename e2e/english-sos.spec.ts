import { expect, test, type Browser, type Page } from "@playwright/test";
import { saveEvidence } from "./helpers/evidence";
import { adminDb, closeTestCases, randomPhone, uniqueTestPoint } from "./helpers/db";
import { applySession, createAccount, type TestAccount } from "./helpers/accounts";
import { expectSentCase } from "./helpers/sos";

/**
 * TF-63 ฟอร์ม SOS ภาษาอังกฤษ (นักท่องเที่ยว)
 * - เปิดครั้งแรก: เบราว์เซอร์ไม่ใช่ภาษาไทย → /en/... · ภาษาไทย → หน้าไทยเหมือนเดิม
 * - ปุ่มสลับ ไทย/EN จำไว้หลังรีโหลด
 * - JS ยังไม่มา: ลิงก์โทร tel: ของหน้า /en กดได้
 * - ส่ง SOS น้ำท่วมภาษาอังกฤษสำเร็จ คำตอบเก็บเป็นรหัสเดิม และกู้ภัยเห็นป้าย "ผู้แจ้งใช้ภาษาอังกฤษ"
 */

const DRAFT_KEY = "namjaithai-sos-draft-v2";
const caseIds: string[] = [];
let admin: TestAccount | undefined;

test.afterAll(async () => {
  await closeTestCases(caseIds);
  if (admin) await adminDb().from("users").update({ status: "SUSPENDED" }).eq("id", admin.id);
});

/** เบราว์เซอร์ใหม่ที่ตั้งภาษา (ไม่มี cookie ภาษา = เปิดครั้งแรก) ขนาดจอตาม project */
async function newVisitor(browser: Browser, locale: string): Promise<Page> {
  const context = await browser.newContext({
    ...test.info().project.use,
    locale,
  });
  return context.newPage();
}

function nextButton(page: Page) {
  return page.getByRole("button", { name: /^Next/ }).filter({ visible: true });
}

async function expectStep(page: Page, step: number) {
  await expect(page.getByText(`Step ${step} of 5`)).toBeVisible();
}

test("เปิดครั้งแรก: เบราว์เซอร์อังกฤษไป /en ภาษาไทยอยู่หน้าไทย และปุ่มสลับภาษาจำไว้หลังรีโหลด", async ({
  browser,
}) => {
  const english = await newVisitor(browser, "en-US");
  await english.goto("/request");
  await expect(english).toHaveURL(/\/en\/request$/);
  await expect(english.getByText("Step 1 of 5")).toBeVisible();
  await expect(english.locator("[lang=en]").first()).toBeVisible();

  // สลับเป็นไทย → จำไว้: รีโหลดแล้วยังเป็นไทย และเปิดหน้าไทยอื่นก็ไม่ถูกพาไป /en อีก
  await english.getByTestId("language-switch").getByRole("link", { name: "ไทย" }).click();
  await expect(english).toHaveURL(/\/request$/);
  await expect(english).not.toHaveURL(/\/en\//);
  await english.reload();
  await expect(english.getByText("ขั้นที่ 1 จาก 5")).toBeVisible();
  await english.goto("/hotlines");
  await expect(english).toHaveURL(/\/hotlines$/);
  await expect(english).not.toHaveURL(/\/en\//);

  // สลับกลับเป็นอังกฤษ → รีโหลดแล้วยังเป็นอังกฤษ
  await english.getByTestId("language-switch").getByRole("link", { name: "EN" }).click();
  await expect(english).toHaveURL(/\/en\/hotlines$/);
  await english.reload();
  await expect(
    english.getByRole("heading", { name: "Emergency hotlines in Thailand" }),
  ).toBeVisible();
  await expect(english.getByTestId("hotline-1155")).toContainText("Tourist Police");
  await english.context().close();

  const thai = await newVisitor(browser, "th-TH");
  await thai.goto("/request");
  await expect(thai).toHaveURL(/\/request$/);
  await expect(thai.getByText("ขั้นที่ 1 จาก 5")).toBeVisible();
  await thai.context().close();
});

test("หน้า /en ตอน JS ยังไม่มา: ลิงก์โทร 1669 กดได้ และมีข้อความโหลดภาษาอังกฤษ", async ({
  page,
  isMobile,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/_next/static/**/*.js", async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto("/en/request", { waitUntil: "commit" });
  await expect(page.getByTestId("hydration-pending")).toContainText("Loading...");
  const call = page.getByRole("link", {
    name: isMobile ? "Call the 1669 emergency medical hotline" : "Ambulance 1669",
    exact: true,
  });
  await expect(call).toHaveAttribute("href", "tel:1669");
  await call.click({ trial: true });
  release();
  await expect(page.getByTestId("hydration-pending")).toHaveCount(0);
});

test("ส่ง SOS น้ำท่วมภาษาอังกฤษสำเร็จ คำตอบเป็นรหัสเดิม กู้ภัยเห็นป้ายผู้แจ้งใช้ภาษาอังกฤษ", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const ip = `10.63.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  await page.route("**/api/cases", (route) =>
    route.fallback({ headers: { ...route.request().headers(), "x-forwarded-for": ip } }),
  );
  await page.goto("/en/request");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expectStep(page, 1);
  await expect(page.getByTestId("hydration-pending")).toHaveCount(0);

  // ขั้น 1: น้ำท่วม + อยู่ที่จุดเกิดเหตุ
  await page.getByRole("radio", { name: "Flood" }).click();
  await page.getByRole("radio", { name: "I am at the scene" }).click();
  await nextButton(page).click();

  // ขั้น 2: ไม่มีสัญญาณอันตราย ออกเองไม่ได้ ระดับน้ำเอว–อก
  await expectStep(page, 2);
  await expect(
    page.getByRole("heading", { name: "Is any of the following happening now?" }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: "None of these" }).click();
  await page.getByRole("radio", { name: "No, I am trapped" }).click();
  await page.getByRole("radio", { name: "Waist to chest deep" }).click();
  await nextButton(page).click();

  // ขั้น 3: ใส่ตำแหน่งในร่าง (แบบเดียวกับ helpers/sos.ts) + จุดสังเกต
  await expectStep(page, 3);
  const point = uniqueTestPoint();
  await page.evaluate(
    ({ key, point }) => {
      const draft = JSON.parse(localStorage.getItem(key) ?? "{}");
      localStorage.setItem(
        key,
        JSON.stringify({
          ...draft,
          ...point,
          accuracyM: 10,
          landmark: "Blue hotel, 3rd floor (E2E)",
        }),
      );
      window.dispatchEvent(new Event("storage"));
    },
    { key: DRAFT_KEY, point },
  );
  await expect(page.locator("#sos-landmark")).toHaveValue("Blue hotel, 3rd floor (E2E)");
  await nextButton(page).click();

  // ขั้น 4 → 5
  await expectStep(page, 4);
  await expect(page.getByRole("heading", { name: "4. What you need" })).toBeVisible();
  await nextButton(page).click();
  await expectStep(page, 5);
  // ไม่มีเบอร์ไทย: ลิงก์โทรตำรวจท่องเที่ยว / 191 (ลิงก์ tel: ธรรมดา)
  const noThaiPhone = page.getByTestId("no-thai-phone-help");
  await expect(noThaiPhone).toContainText("No Thai phone number? Call");
  await expect(noThaiPhone.getByRole("link", { name: "1155 (Tourist Police)" })).toHaveAttribute(
    "href",
    "tel:1155",
  );
  await expect(noThaiPhone.getByRole("link", { name: "191", exact: true })).toHaveAttribute(
    "href",
    "tel:191",
  );
  await page.getByLabel(/^Your name or a contact name/).fill("Tourist E2E");
  await page.getByLabel(/^Phone number to call you back/).fill(randomPhone());
  await page.getByRole("checkbox", { name: /^I consent to the use of my information/ }).check();
  await page.getByRole("checkbox", { name: /^I consent to the use of health information/ }).check();
  await page.getByRole("button", { name: "Request help now" }).click();

  // TF-80: ส่งสำเร็จแล้วไปหน้ารหัสเคสใหญ่ภาษาอังกฤษเอง
  const caseCode = await expectSentCase(page);
  await expect(page).toHaveURL(/\/en\/sos\/sent$/);
  await expect(page.getByRole("heading", { name: "Your request was received" })).toBeVisible();
  // ติดตามเคส: ยังอยู่ในหน้าภาษาอังกฤษ
  await page.getByRole("link", { name: "Track my case" }).click();
  await expect(page).toHaveURL(/\/en\/track\/FL-/);
  await expect(page.getByTestId("track-panel")).toContainText("Waiting for a team");

  const { data: row } = await adminDb()
    .from("cases")
    .select("id, reporter_locale, incident_type, details, landmark")
    .eq("case_code", caseCode)
    .single()
    .throwOnError();
  caseIds.push(row!.id);
  // คำตอบเก็บเป็นรหัสเดิม ไม่ใช่ข้อความภาษาอังกฤษ
  expect(row).toMatchObject({
    reporter_locale: "en",
    incident_type: "FLOOD",
    details: expect.objectContaining({ waterLevel: "WAIST_CHEST", canSelfEvacuate: false }),
  });

  // กู้ภัย/แอดมินเห็นเคสเป็นภาษาไทย พร้อมป้าย
  admin = await createAccount({ displayName: `TF63 admin ${caseCode}`, role: "ADMIN" });
  const rescuerContext = await browser.newContext({ ...test.info().project.use });
  await applySession(rescuerContext, admin);
  const rescuer = await rescuerContext.newPage();
  await rescuer.goto(`/rescue/cases/${row!.id}`);
  await expect(rescuer.getByTestId("reporter-locale-badge")).toHaveText("ผู้แจ้งใช้ภาษาอังกฤษ");
  await saveEvidence(rescuer, "9-english-reporter-badge", test.info());
  await expect(rescuer.getByText("ระดับน้ำรอบตัวคุณ")).toBeVisible();
  await rescuerContext.close();
});
