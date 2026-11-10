import { expect, test, type Page } from "@playwright/test";
import { adminDb, closeTestCases } from "./helpers/db";
import { applySession, createAccount, type TestAccount } from "./helpers/accounts";

/**
 * TF-70 เคสตัวอย่างแยกจากงานจริง
 * หน่วยโชว์กรุงเทพฯ (seed ของ TF-57) มีเคสค้าง DEMO-S1-A1..A3 / DEMO-S2-A1..A2
 * กู้ภัยหน่วยจริงในกรุงเทพฯ ต้องไม่เห็นเคสเหล่านี้ทั้งหน้ารายการและแผนที่ (เห็นแค่เคสจริง)
 * คิวแอดมิน (TF-31) ก็ไม่มีเคสตัวอย่าง แต่ dashboard ผลงานหน่วยโชว์ยังมี "กำลังช่วย"
 */
test.describe.configure({ mode: "serial" });

const DEMO_CODES = ["DEMO-S1-A1", "DEMO-S1-A2", "DEMO-S1-A3", "DEMO-S2-A1", "DEMO-S2-A2"];
let tag: string;
let rescuer: TestAccount;
let admin: TestAccount;
let unitId: string;
let realCaseId: string;
let realCode: string;

test.beforeAll(async ({}, testInfo) => {
  const db = adminDb();
  tag = `TF70${testInfo.project.name[0]}${crypto.randomUUID().slice(0, 6)}`.toUpperCase();
  rescuer = await createAccount({ displayName: `${tag} กู้ภัย`, role: "RESCUER" });
  admin = await createAccount({ displayName: `${tag} แอดมิน`, role: "ADMIN" });
  const { data: unit } = await db
    .from("units")
    .insert({ name: `${tag} หน่วยจริง`, province: "กรุงเทพมหานคร" })
    .select("id")
    .single()
    .throwOnError();
  unitId = unit!.id;
  await db
    .from("unit_members")
    .insert({ unit_id: unitId, user_id: rescuer.id, role_in_unit: "MEMBER", status: "APPROVED" })
    .throwOnError();
  // เคสจริงในกรุงเทพฯ ใกล้หน่วยโชว์ ไว้ยืนยันว่ารายการโหลดแล้วจริง
  realCode = `${tag}-REAL`;
  const { data: real } = await db
    .from("cases")
    .insert({
      case_code: realCode,
      urgency: "YELLOW",
      lat: 13.7285,
      lng: 100.5248,
      province: "กรุงเทพมหานคร",
      landmark: `${tag} หน้าวัด`,
      incident_type: "FLOOD",
    })
    .select("id")
    .single()
    .throwOnError();
  realCaseId = real!.id;
});

test.afterAll(async () => {
  const db = adminDb();
  await closeTestCases([realCaseId].filter(Boolean));
  if (unitId) await db.from("units").update({ is_active: false }).eq("id", unitId);
  const users = [rescuer, admin].filter(Boolean).map((user) => user.id);
  if (users.length) await db.from("users").update({ status: "SUSPENDED" }).in("id", users);
});

// ข้อมูลที่หน้าเว็บได้จาก list_rescue_cases (ทั้งรายการและแผนที่ใช้ RPC เดียวกัน)
function rescueListResponse(page: Page) {
  return page.waitForResponse(
    (response) => response.url().includes("/rpc/list_rescue_cases") && response.ok(),
  );
}

test("กู้ภัยในจังหวัดเดียวกับหน่วยโชว์ไม่เห็นเคสตัวอย่างในหน้ารายการและแผนที่", async ({
  page,
  context,
}) => {
  await applySession(context, rescuer);
  const db = adminDb();
  const { count } = await db
    .from("cases")
    .select("id", { count: "exact", head: true })
    .in("case_code", DEMO_CODES)
    .in("status", ["ACCEPTED", "EN_ROUTE", "ON_SITE"]);
  expect(count, "seed มีเคสตัวอย่างค้างในกรุงเทพฯ").toBe(DEMO_CODES.length);

  // หน้ารายการเคส
  const listed = rescueListResponse(page);
  await page.goto("/rescue/cases");
  const listBody = JSON.stringify(await (await listed).json());
  expect(listBody).toContain(realCode);
  for (const code of DEMO_CODES) expect(listBody).not.toContain(code);
  await expect(page.getByTestId("rescue-case-card").filter({ hasText: realCode })).toBeVisible();
  await expect(page.getByText(/DEMO-S\d-A\d/)).toHaveCount(0);

  // แผนที่กู้ภัย
  const mapped = rescueListResponse(page);
  await page.goto("/rescue/map");
  await expect(page.getByTestId("rescue-map-container")).toBeVisible();
  const mapBody = JSON.stringify(await (await mapped).json());
  expect(mapBody).toContain(realCode);
  for (const code of DEMO_CODES) {
    expect(mapBody).not.toContain(code);
    await expect(page.getByTestId(`map-pin-${code}`)).toHaveCount(0);
  }

  // หน้ารายละเอียดเคสตัวอย่างเปิดไม่ได้
  const { data: demo } = await db
    .from("cases")
    .select("id")
    .eq("case_code", DEMO_CODES[0])
    .single();
  // หน้านี้ stream ผ่าน Suspense: notFound() แสดงหน้า 404 แต่สถานะ HTTP ส่งเป็น 200 ไปก่อนแล้ว
  await page.goto(`/rescue/cases/${demo!.id}`);
  await expect(page.getByText("This page could not be found.")).toBeVisible();
  await expect(page.getByText(DEMO_CODES[0])).toHaveCount(0);
});

test("คิวแอดมินไม่มีเคสตัวอย่าง แต่ dashboard ผลงานหน่วยโชว์ยังแสดงเคสที่กำลังช่วย", async ({
  page,
  context,
}) => {
  await applySession(context, admin);
  await page.goto("/admin");
  const response = await page.request.get("/api/admin/cases");
  expect(response.ok()).toBe(true);
  const { cases } = (await response.json()) as { cases: { case_code: string; is_demo: boolean }[] };
  // หน้าแรก (50 เคสเก่าสุดที่ยังเปิด) — เคสตัวอย่างจาก seed เก่ากว่าเคสของ test ทุกเคส ถ้าไม่กรองจะอยู่หน้านี้แน่นอน
  expect(cases.length).toBeGreaterThan(0);
  expect(cases.filter((item) => item.is_demo)).toEqual([]);

  await page.goto("/unit/dashboard?unit=d5630000-0000-4000-8000-000000000001");
  await expect(page.getByText("ข้อมูลตัวอย่าง")).toBeVisible();
  await expect(page.getByTestId("stat-active")).toContainText("3");
});
