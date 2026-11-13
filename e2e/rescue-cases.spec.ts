import { expect, test, type Page } from "@playwright/test";
import { adminDb } from "./helpers/db";
import { applySession, createAccount, deleteAccount, type TestAccount } from "./helpers/accounts";

/**
 * TF-23 รายการเคสสำหรับกู้ภัย (/rescue/cases)
 * จอคอมกับมือถือรันพร้อมกัน จึงแยกข้อมูลคนละจังหวัด (สกลนคร / นครพนม) ไม่ให้เห็นเคสของกันและกัน
 * TF-39: ย้ายจาก ตราด / จันทบุรี ซึ่ง spec อื่นสร้างเคสเปิดไว้ตรงจุดกลางพอดี จนนับได้ 8 เคสแทน 4 — จังหวัดนี้ห้ามไฟล์อื่นใช้
 *
 * เคส (กู้ภัยอยู่ที่จุดศูนย์กลาง)
 *   C1 RED    NEW       ~1 กม.  รอ 2 ชม. 15 นาที  GPS ±16,238 ม.  ผู้ป่วยติดเตียง 1
 *   C2 YELLOW NEW       ~8 กม.  รอ 30 นาที        GPS ±350 ม.     เด็กเล็ก 2
 *   C3 GREEN  NEW       ~15 กม. รอ 3 ชม.          ปักเอง           ไฟไหม้ (หน่วยมีแค่เรือ → ตัวกรองซ่อน)
 *   C4 YELLOW ACCEPTED  ~2 กม.  สร้าง 5 ชม.ก่อน
 *   C5 RED    RESOLVED  (ปิดแล้ว ต้องไม่แสดง)
 */
test.describe.configure({ mode: "serial" });

const CENTER: Record<string, { province: string; lat: number; lng: number }> = {
  desktop: { province: "สกลนคร", lat: 17.155, lng: 104.135 },
  mobile: { province: "นครพนม", lat: 17.41, lng: 104.78 },
};
const SECRET_PHONE = "0899992323";
const SECRET_NAME = "ชื่อลับ TF23";

let account: TestAccount;
let unitId: string;
let caseIds: string[] = [];
let tag: string;

test.beforeAll(async ({}, testInfo) => {
  const db = adminDb();
  const { province, lat, lng } = CENTER[testInfo.project.name];
  tag = `TF23${testInfo.project.name === "desktop" ? "D" : "M"}${crypto.randomUUID().slice(0, 4)}`;
  account = await createAccount({ displayName: `กู้ภัย ${tag}`, role: "RESCUER" });

  const { data: unit, error: unitError } = await db
    .from("units")
    .insert({ name: `หน่วย ${tag}`, province })
    .select("id")
    .single();
  if (unitError) throw unitError;
  unitId = unit.id;
  await db
    .from("unit_members")
    .insert({ unit_id: unitId, user_id: account.id, role_in_unit: "MEMBER", status: "APPROVED" })
    .throwOnError();
  await db.from("unit_capabilities").insert({ unit_id: unitId, capability: "BOAT" }).throwOnError();

  const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
  const rows = [
    {
      code: "C1",
      urgency: "RED",
      status: "NEW",
      dLat: 0.009,
      created: ago(135),
      source: "GPS",
      accuracy: 16238,
      type: "FLOOD",
    },
    {
      code: "C2",
      urgency: "YELLOW",
      status: "NEW",
      dLat: 0.072,
      created: ago(30),
      source: "GPS",
      accuracy: 350,
      type: "FLOOD",
    },
    {
      code: "C3",
      urgency: "GREEN",
      status: "NEW",
      dLat: 0.135,
      created: ago(180),
      source: "MANUAL_PIN",
      accuracy: null,
      type: "FIRE",
    },
    {
      code: "C4",
      urgency: "YELLOW",
      status: "ACCEPTED",
      dLat: 0.018,
      created: ago(300),
      source: "GPS",
      accuracy: 20,
      type: "FLOOD",
    },
    {
      code: "C5",
      urgency: "RED",
      status: "RESOLVED",
      dLat: 0.001,
      created: ago(400),
      source: "GPS",
      accuracy: 20,
      type: "FLOOD",
    },
  ];
  const { data: inserted } = await db
    .from("cases")
    .insert(
      rows.map((r) => ({
        case_code: `${tag}-${r.code}`,
        urgency: r.urgency,
        status: r.status,
        priority_score: r.code === "C2" ? 200 : 100,
        triage_reasons: ["WATER_UNKNOWN"],
        lat: lat + r.dLat,
        lng,
        accuracy_m: r.accuracy,
        location_source: r.source,
        landmark: `จุดสังเกต ${r.code}`,
        province,
        incident_type: r.type,
        created_at: r.created,
        assigned_unit_id: r.status === "ACCEPTED" ? unitId : null,
      })),
    )
    .select("id, case_code")
    .throwOnError();
  caseIds = (inserted ?? []).map((c) => c.id);
  const byCode = Object.fromEntries((inserted ?? []).map((c) => [c.case_code, c.id]));
  await db
    .from("case_people")
    .insert([
      { case_id: byCode[`${tag}-C1`], adults: 1, elderly: 0, bedridden: 1, children: 0 },
      { case_id: byCode[`${tag}-C2`], adults: 1, elderly: 0, bedridden: 0, children: 2 },
    ])
    .throwOnError();
  await db
    .from("case_contacts")
    .insert({
      case_id: byCode[`${tag}-C1`],
      name: SECRET_NAME,
      phone: SECRET_PHONE,
      phone_last4: "2323",
    })
    .throwOnError();
});

test.afterAll(async () => {
  const db = adminDb();
  if (caseIds.length) await db.from("cases").delete().in("id", caseIds);
  if (unitId) await db.from("units").delete().eq("id", unitId);
  if (account) await deleteAccount(account);
});

const cards = (page: Page) => page.getByTestId("rescue-case-card");
const codes = async (page: Page) =>
  (await cards(page).evaluateAll((els) => els.map((el) => el.getAttribute("data-case-code")))).map(
    (code) => code!.split("-").pop(),
  );

async function openWithGps(
  page: Page,
  context: import("@playwright/test").BrowserContext,
  project: string,
) {
  const { lat, lng } = CENTER[project];
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: lat, longitude: lng, accuracy: 20 });
  await applySession(context, account);
  await page.goto("/rescue/cases");
  await expect(page.getByTestId("case-count")).toContainText("พบ 4 เคส");
}

test("มี GPS: เรียง 3 แบบ ระยะทาง เวลารอ ป้ายต่างๆ และตัวกรองความสามารถ", async ({
  page,
  context,
}, testInfo) => {
  await openWithGps(page, context, testInfo.project.name);

  // ตัวกรองความสามารถเปิดเป็นค่าเริ่มต้น: หน่วยมีแค่เรือ → ซ่อนไฟไหม้ (C3) แต่ยังนับใน 4 เคส
  await expect(page.getByLabel("แสดงเฉพาะเหตุที่หน่วยช่วยได้")).toBeChecked();
  await expect(page.getByTestId("case-count")).toContainText("ซ่อน 1 เคส");
  expect(await codes(page)).toEqual(["C1", "C2", "C4"]);

  await page.getByLabel("แสดงเฉพาะเหตุที่หน่วยช่วยได้").uncheck();
  expect(await codes(page)).toEqual(["C1", "C2", "C4", "C3"]);

  await page.getByRole("button", { name: "ใกล้ก่อน" }).click();
  await expect.poll(() => codes(page)).toEqual(["C1", "C4", "C2", "C3"]);
  await page.getByRole("button", { name: "รอนานก่อน" }).click();
  // NEW ก่อนเสมอ เรียงรอนานสุด แล้วค่อยเคสที่มีคนรับแล้ว (C4 สร้างนานสุดแต่รับแล้ว)
  await expect.poll(() => codes(page)).toEqual(["C3", "C1", "C2", "C4"]);

  const c1 = cards(page).filter({ hasText: `${tag}-C1` });
  const c2 = cards(page).filter({ hasText: `${tag}-C2` });
  await expect(c1.getByTestId("case-distance")).toHaveText(/^(9\d\d ม\.|1\.0 กม\.)$/);
  await expect(c1.getByTestId("case-wait")).toHaveText(/รอมาแล้ว 2 ชม\. 1[5-6] นาที/);
  await expect(c1.getByTestId("case-wait")).toHaveAttribute("data-long-wait", "true");
  await expect(c2.getByTestId("case-wait")).toHaveAttribute("data-long-wait", "false");
  await expect(
    cards(page)
      .filter({ hasText: `${tag}-C4` })
      .getByTestId("case-wait"),
  ).toHaveCount(0);

  // ป้ายพิกัดจาก TF-65
  await expect(c1.getByTestId("accuracy-warning")).toHaveAttribute("data-level", "danger");
  await expect(c1.getByTestId("accuracy-warning")).toHaveText(
    "พิกัดคลาดได้ ~16 กม. · โทรยืนยันตำแหน่งก่อนออก",
  );
  await expect(c2.getByTestId("accuracy-warning")).toHaveText("พิกัดคลาดได้ ~0.4 กม.");
  await expect(
    cards(page)
      .filter({ hasText: `${tag}-C3` })
      .getByTestId("accuracy-warning"),
  ).toHaveCount(0);

  await expect(c1).toContainText("ผู้ป่วยติดเตียง 1");
  await expect(c2).toContainText("เด็กเล็ก 2");
  await expect(c1.getByTestId("triage-tag")).toBeVisible();

  // ไม่มีข้อมูลส่วนตัวในหน้า และไม่มีเคสที่ปิดแล้ว
  const body = await page.locator("body").innerText();
  expect(body).not.toContain(SECRET_PHONE);
  expect(body).not.toContain(SECRET_NAME);
  expect(body).not.toContain(`${tag}-C5`);

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("ตัวกรองรัศมี 5 / 10 กม.", async ({ page, context }, testInfo) => {
  await openWithGps(page, context, testInfo.project.name);
  await page.getByLabel("แสดงเฉพาะเหตุที่หน่วยช่วยได้").uncheck();
  const radius = page.getByLabel("รัศมีจากตำแหน่งของคุณ");
  await radius.selectOption("5000");
  await expect(page.getByTestId("case-count")).toContainText("พบ 2 เคส");
  expect(await codes(page)).toEqual(["C1", "C4"]);
  await radius.selectOption("10000");
  await expect(page.getByTestId("case-count")).toContainText("พบ 3 เคส");
  await radius.selectOption("");
  await expect(page.getByTestId("case-count")).toContainText("พบ 4 เคส");
});

test("ไม่อนุญาต GPS: ใช้จังหวัดของหน่วยแทน และเรียงตามระยะทางไม่ได้", async ({ page, context }) => {
  await context.clearPermissions();
  await applySession(context, account);
  await page.goto("/rescue/cases");
  await expect(page.getByTestId("location-fallback")).toBeVisible();
  await expect(page.getByTestId("case-count")).toContainText("พบ 4 เคส");
  await expect(page.getByRole("button", { name: "ใกล้ก่อน" })).toBeDisabled();
  await expect(page.getByTestId("case-distance")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
