import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { adminDb } from "./helpers/db";
import { applySession, createAccount, deleteAccount, type TestAccount } from "./helpers/accounts";

/**
 * TF-22 แผนที่กู้ภัย (/rescue/map)
 * จอคอมกับมือถือรันพร้อมกัน จึงแยกข้อมูลคนละจังหวัด (ตราด / จันทบุรี)
 *
 * เคสทดสอบ:
 *   C1 RED    NEW       ~1 กม.   รอ 2 ชม. 15 นาที  GPS ±16,238 ม.  ติดเตียง 1  น้ำท่วม
 *   C2 YELLOW NEW       ~8 กม.   รอ 30 นาที        GPS ±350 ม.     เด็กเล็ก 2  น้ำท่วม
 *   C3 GREEN  NEW       ~15 กม.  รอ 3 ชม.          ปักเอง          ไฟไหม้ (หน่วยมีแค่เรือ -> ซ่อนเมื่อเปิดตัวกรองความสามารถ)
 *   C4 YELLOW ACCEPTED  ~2 กม.   รอ 5 ชม.          GPS             น้ำท่วม (รับเคสแล้ว)
 */
test.describe.configure({ mode: "serial" });

const CENTER: Record<string, { province: string; lat: number; lng: number }> = {
  desktop: { province: "ตราด", lat: 12.24, lng: 102.52 },
  mobile: { province: "จันทบุรี", lat: 12.61, lng: 102.1 },
};
const SECRET_PHONE = "0899992222";
const SECRET_NAME = "ผู้แจ้งลับ TF22";

let account: TestAccount;
let unitId: string;
let caseIds: string[] = [];
let tag: string;

test.beforeAll(async ({}, testInfo) => {
  const db = adminDb();
  const { province, lat, lng } = CENTER[testInfo.project.name];
  tag = `TF22${testInfo.project.name === "desktop" ? "D" : "M"}${crypto.randomUUID().slice(0, 4)}`;
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
      dLng: 0,
      created: ago(135),
      source: "GPS",
      accuracy: 16238,
      type: "FLOOD",
      landmark: "ตรงข้ามวัดใหญ่",
    },
    {
      code: "C2",
      urgency: "YELLOW",
      status: "NEW",
      dLat: 0.072,
      dLng: 0,
      created: ago(30),
      source: "GPS",
      accuracy: 350,
      type: "FLOOD",
      landmark: "ซอยต้นโพธิ์",
    },
    {
      code: "C3",
      urgency: "GREEN",
      status: "NEW",
      dLat: 0.135,
      dLng: 0,
      created: ago(180),
      source: "MANUAL_PIN",
      accuracy: null,
      type: "FIRE",
      landmark: "โรงสีเก่า",
    },
    {
      code: "C4",
      urgency: "YELLOW",
      status: "ACCEPTED",
      dLat: 0.018,
      dLng: 0,
      created: ago(300),
      source: "GPS",
      accuracy: 20,
      type: "FLOOD",
      landmark: "สะพานขาว",
    },
  ];

  const { data: inserted } = await db
    .from("cases")
    .insert(
      rows.map((r) => ({
        case_code: `${tag}-${r.code}`,
        urgency: r.urgency,
        status: r.status,
        priority_score: 100,
        triage_reasons: ["WATER_UNKNOWN"],
        lat: lat + r.dLat,
        lng: lng + r.dLng,
        accuracy_m: r.accuracy,
        location_source: r.source,
        landmark: r.landmark,
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
      phone_last4: "2222",
    })
    .throwOnError();
});

test.afterAll(async () => {
  const db = adminDb();
  if (caseIds.length) await db.from("cases").delete().in("id", caseIds);
  if (unitId) await db.from("units").delete().eq("id", unitId);
  if (account) await deleteAccount(account);
});

async function openRescueMap(
  page: Page,
  context: BrowserContext,
  project: string,
  url = "/rescue/map",
) {
  const { lat, lng } = CENTER[project];
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: lat, longitude: lng, accuracy: 20 });
  await applySession(context, account);
  await page.goto(url);
  await expect(page.getByTestId("rescue-map-container")).toBeVisible();
}

async function showAllCapabilities(page: Page) {
  const checkbox = page.getByRole("checkbox", { name: "แสดงเฉพาะเหตุที่หน่วยช่วยได้" });
  await expect(checkbox).toBeVisible();
  await checkbox.uncheck();
}

async function focusCase(page: Page, urgency: "วิกฤต" | "เร่งด่วน" | "ทั่วไป", status = "ALL") {
  await page.getByLabel("ตัวกรองสถานะ").selectOption(status);
  await page.getByRole("group", { name: "กรองความเร่งด่วน" }).getByRole("button", { name: urgency }).click();
}

test.describe("TF-22 แผนที่กู้ภัย (/rescue/map)", () => {
  test("หมุดใกล้กันรวมกลุ่มเมื่อซูมออกและกดกลุ่มเพื่อขยายได้", async ({ page, context }, testInfo) => {
    await openRescueMap(page, context, testInfo.project.name);
    const cluster = page.getByTestId("map-cluster").first();
    await expect(cluster).toBeVisible();
    expect(Number(await cluster.getAttribute("data-cluster-count"))).toBeGreaterThanOrEqual(2);
    await cluster.click();
    await expect(page.getByTestId(`map-pin-${tag}-C1`)).toBeVisible();
  });

  test("หมุดสีถูกต้องตามความเร่งด่วน: แดง (#C62828), เหลือง (#F2A516), เขียว (#1B7A3A)", async ({
    page,
    context,
  }, testInfo) => {
    await openRescueMap(page, context, testInfo.project.name);

    // ปิดตัวกรองความสามารถหน่วยชั่วคราวเพื่อให้เห็นทุกเคสรวมถึง C3 (FIRE)
    await showAllCapabilities(page);

    await focusCase(page, "วิกฤต");
    const pinC1 = page.getByTestId(`map-pin-${tag}-C1`);
    await expect(pinC1).toBeVisible();
    await expect(pinC1).toHaveAttribute("data-urgency", "RED");
    await expect(pinC1.locator('[data-incident-icon="FLOOD"]')).toBeVisible();

    await focusCase(page, "เร่งด่วน", "NEW");
    const pinC2 = page.getByTestId(`map-pin-${tag}-C2`);
    await expect(pinC2).toBeVisible();
    await expect(pinC2).toHaveAttribute("data-urgency", "YELLOW");

    await focusCase(page, "ทั่วไป");
    await page.getByRole("button", { name: "Zoom out" }).click();
    const pinC3 = page.getByTestId(`map-pin-${tag}-C3`);
    await expect(pinC3).toBeVisible();
    await expect(pinC3).toHaveAttribute("data-urgency", "GREEN");
    await expect(pinC3.locator('[data-incident-icon="FIRE"]')).toBeVisible();
  });

  test("ข้อมูลที่โหลดมาไม่มีเบอร์โทรหรือชื่อผู้แจ้ง (PDPA)", async ({
    page,
    context,
  }, testInfo) => {
    let leakedInNetwork = false;
    page.on("response", async (response) => {
      try {
        const text = await response.text();
        if (text.includes(SECRET_PHONE) || text.includes(SECRET_NAME)) {
          leakedInNetwork = true;
        }
      } catch {
        // ignore non-text responses
      }
    });

    await openRescueMap(page, context, testInfo.project.name);

    // คลิกเปิดแผ่นรายละเอียดเคส C1
    await focusCase(page, "วิกฤต");
    const pinC1 = page.getByTestId(`map-pin-${tag}-C1`);
    await pinC1.click();
    await expect(page.getByTestId("case-detail-sheet")).toBeVisible();

    const pageContent = await page.content();
    expect(pageContent).not.toContain(SECRET_PHONE);
    expect(pageContent).not.toContain(SECRET_NAME);
    expect(leakedInNetwork).toBe(false);
  });

  test("แผ่นรายละเอียดเมื่อแตะหมุด: เคสที่ยังไม่มีคนรับ แสดงเวลารอ 'รอมาแล้ว X ชม. Y นาที' และเคสที่รับแล้วแสดงสถานะ", async ({
    page,
    context,
  }, testInfo) => {
    await openRescueMap(page, context, testInfo.project.name);

    // 1. แตะ C1 (NEW, สร้าง 135 นาทีที่แล้ว) -> รอมาแล้ว 2 ชม. 15 นาที
    await focusCase(page, "วิกฤต");
    await page.getByTestId(`map-pin-${tag}-C1`).click();
    const sheet = page.getByTestId("case-detail-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId("wait-duration")).toContainText("รอมาแล้ว 2 ชม. 15 นาที");
    await expect(sheet.getByText("ตรงข้ามวัดใหญ่")).toBeVisible();
    await expect(sheet.getByText(/ผู้ป่วยติดเตียง 1 คน/)).toBeVisible();

    // ปิดแผ่นรายละเอียด
    await page.getByRole("button", { name: "ปิดแผ่นรายละเอียด" }).click();
    await expect(sheet).not.toBeVisible();

    // 2. แตะ C2 (NEW, สร้าง 30 นาทีที่แล้ว) -> รอมาแล้ว 30 นาที
    await focusCase(page, "เร่งด่วน", "NEW");
    await page.getByTestId(`map-pin-${tag}-C2`).click();
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId("wait-duration")).toContainText("รอมาแล้ว 30 นาที");

    await page.getByRole("button", { name: "ปิดแผ่นรายละเอียด" }).click();

    // 3. แตะ C4 (ACCEPTED) -> ไม่มีเวลารอ แสดงสถานะรับเคสแล้ว
    await focusCase(page, "เร่งด่วน", "ACCEPTED");
    await page.getByTestId(`map-pin-${tag}-C4`).click();
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId("wait-duration")).not.toBeVisible();
    await expect(sheet.getByText("รับเคสแล้ว")).toBeVisible();
  });

  test("ตัวกรองสี สถานะ ประเภทเหตุ และความสามารถหน่วย เปลี่ยนหมุดทันที", async ({
    page,
    context,
  }, testInfo) => {
    await openRescueMap(page, context, testInfo.project.name);

    // เริ่มต้น: ปิดตัวกรองความสามารถหน่วย
    const capCheckbox = page.getByRole("checkbox", { name: "แสดงเฉพาะเหตุที่หน่วยช่วยได้" });
    await showAllCapabilities(page);

    // 1. กรองเฉพาะสีแดง (วิกฤต)
    await page.getByRole("button", { name: /วิกฤต/ }).click();
    await expect(page.getByTestId(`map-pin-${tag}-C1`)).toBeVisible();
    await expect(page.getByTestId(`map-pin-${tag}-C2`)).not.toBeVisible();
    await expect(page.getByTestId(`map-pin-${tag}-C3`)).not.toBeVisible();
    await expect(page.getByTestId(`map-pin-${tag}-C4`)).not.toBeVisible();

    // กลับมากด "ทั้งหมด"
    await page.getByRole("button", { name: /ทั้งหมด \(/ }).click();
    await expect(page.getByTestId("rescue-map-container")).toHaveAttribute("data-active-pins", "4");

    // 2. กรองสถานะ "รับเคสแล้ว"
    await page.getByLabel("ตัวกรองสถานะ").selectOption("ACCEPTED");
    await expect(page.getByTestId(`map-pin-${tag}-C4`)).toBeVisible();
    await expect(page.getByTestId(`map-pin-${tag}-C1`)).not.toBeVisible();

    // กลับเป็น "ทุกสถานะ"
    await page.getByLabel("ตัวกรองสถานะ").selectOption("ALL");
    await expect(page.getByTestId("rescue-map-container")).toHaveAttribute("data-active-pins", "4");

    // 3. กรองประเภทเหตุ "ไฟไหม้"
    await page.getByLabel("ตัวกรองประเภทเหตุ").selectOption("FIRE");
    await page.getByRole("button", { name: "Zoom out" }).click();
    await expect(page.getByTestId(`map-pin-${tag}-C3`)).toBeVisible();
    await expect(page.getByTestId(`map-pin-${tag}-C1`)).not.toBeVisible();

    // กลับเป็น "ทุกประเภทเหตุ"
    await page.getByLabel("ตัวกรองประเภทเหตุ").selectOption("ALL");

    // 4. เปิดตัวกรองความสามารถหน่วย (หน่วยมี BOAT -> ซ่อน FIRE)
    if (await capCheckbox.isVisible()) {
      await capCheckbox.check();
      await expect(page.getByTestId("rescue-map-container")).toHaveAttribute("data-active-pins", "3");
      await expect(page.getByTestId(`map-pin-${tag}-C3`)).not.toBeVisible();
    }
  });

  test("ตัวกรองรัศมี 5 / 10 / 20 กม. / ทั้งหมด เปลี่ยนแล้วหมุดเปลี่ยนทันที", async ({
    page,
    context,
  }, testInfo) => {
    await openRescueMap(page, context, testInfo.project.name);

    const radiusSelect = page.getByLabel("ตัวกรองรัศมี");
    await expect(radiusSelect).toBeVisible();

    // ปิดตัวกรองความสามารถหน่วยเพื่อให้เห็น C3 เมื่ออยู่ในรัศมี
    await showAllCapabilities(page);

    // 1. เลือกรัศมี 5 กม. -> C1 (~1 กม.) และ C4 (~2 กม.) ต้องแสดง; C2 (~8 กม.) และ C3 (~15 กม.) ต้องไม่แสดง
    await radiusSelect.selectOption("5000");
    await expect(page.getByTestId("rescue-map-container")).toHaveAttribute("data-active-pins", "2");

    // 2. เลือกรัศมี 10 กม. -> C2 (~8 กม.) เพิ่มเข้ามาทันที
    await radiusSelect.selectOption("10000");
    await expect(page.getByTestId("rescue-map-container")).toHaveAttribute("data-active-pins", "3");

    // 3. เลือก "ทั้งหมด" -> C3 (~15 กม.) แสดงครบ
    await radiusSelect.selectOption("");
    await expect(page.getByTestId("rescue-map-container")).toHaveAttribute("data-active-pins", "4");
  });

  test("สลับไปมาระหว่างหน้าแผนที่ (/rescue/map) และหน้ารายการเคส (/rescue/cases)", async ({
    page,
    context,
  }, testInfo) => {
    test.setTimeout(60_000);
    await openRescueMap(page, context, testInfo.project.name);

    // กด "ดูรายการเคส" จากหน้าแผนที่
    await page.getByRole("link", { name: "ดูรายการเคส" }).click();
    await expect(page).toHaveURL(/\/rescue\/cases$/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "รายการเคส", level: 1 })).toBeVisible();

    // กด "ดูบนแผนที่" จากหน้ารายการเคส
    await page.getByRole("link", { name: "ดูบนแผนที่" }).click();
    await expect(page).toHaveURL(/\/rescue\/map$/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "แผนที่กู้ภัย", level: 1 })).toBeVisible();
  });
});
