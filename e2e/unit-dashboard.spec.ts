import { expect, test } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { adminDb, closeTestCases } from "./helpers/db";
import { applySession, createAccount, type TestAccount } from "./helpers/accounts";
import { expectReadableAxis } from "./helpers/chart";

/**
 * TF-57 ผลงานหน่วย + ด่านกันปั๊มผลงาน
 * - เคสเดินครบขั้นจริง (รับ → ช่วยเสร็จ → ผู้แจ้งยืนยัน) ภายในไม่กี่วินาที จึงติดด่าน "เร็วผิดปกติ"
 *   → ยังไม่นับ → แอดมินกดผ่านใน /admin → สมาชิกเห็นผลงานใน /unit/dashboard (จอ 375px)
 * - CSV มี BOM · คนนอกหน่วยดาวน์โหลดไม่ได้ · หน่วยตัวอย่างมีป้าย "ข้อมูลตัวอย่าง"
 */
test.describe.configure({ mode: "serial" });

const AREA: Record<string, { province: string; lat: number; lng: number }> = {
  desktop: { province: "ปัตตานี", lat: 6.87, lng: 101.25 },
  mobile: { province: "นราธิวาส", lat: 6.43, lng: 101.82 },
};
// หน่วยโชว์ของ TF-57 ใน seed (กรุงเทพฯ เขตบางรัก) — เคสแน่นหลายประเภทเหตุ
const SHOWCASE_UNIT_ID = "d5630000-0000-4000-8000-000000000001";

let area: (typeof AREA)[string];
let tag: string;
let rescuer: TestAccount;
let outsider: TestAccount;
let admin: TestAccount;
let unitId: string;
let otherUnitId: string;
let caseId: string;
let caseCode: string;

function clientOf(account: TestAccount) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll: () => account.cookies, setAll: () => undefined } },
  );
}

test.beforeAll(async ({}, testInfo) => {
  const db = adminDb();
  area = AREA[testInfo.project.name] ?? AREA.desktop;
  tag = `TF57${testInfo.project.name[0]}${crypto.randomUUID().slice(0, 6)}`;
  rescuer = await createAccount({ displayName: `${tag} กู้ภัย`, role: "RESCUER" });
  outsider = await createAccount({ displayName: `${tag} หน่วยอื่น`, role: "RESCUER" });
  admin = await createAccount({ displayName: `${tag} แอดมิน`, role: "ADMIN" });
  const ids: string[] = [];
  for (const [account, name] of [
    [rescuer, `${tag} หน่วยผลงาน`],
    [outsider, `${tag} หน่วยอื่น`],
  ] as const) {
    const { data: unit } = await db
      .from("units")
      .insert({ name, province: area.province, district: "เมือง" })
      .select("id")
      .single()
      .throwOnError();
    ids.push(unit!.id);
    await db
      .from("unit_members")
      .insert({
        unit_id: unit!.id,
        user_id: account.id,
        role_in_unit: "MEMBER",
        status: "APPROVED",
      })
      .throwOnError();
  }
  [unitId, otherUnitId] = ids;

  // เคสเดินครบขั้นผ่าน RPC จริง แล้วผู้แจ้งยืนยันปิดเคส (TF-58)
  // ฟังก์ชันยืนยันของ TF-58 ค้นรหัสเคสแบบตัวพิมพ์ใหญ่
  caseCode = `${tag}-C1`.toUpperCase();
  const { data: item } = await db
    .from("cases")
    .insert({
      case_code: caseCode,
      urgency: "YELLOW",
      lat: area.lat,
      lng: area.lng,
      province: area.province,
      landmark: `${tag} หน้าวัด`,
      incident_type: "FLOOD",
    })
    .select("id, version")
    .single()
    .throwOnError();
  caseId = item!.id;
  await db
    .from("case_contacts")
    .insert({ case_id: caseId, name: "ผู้แจ้ง TF57", phone: "0895700057", phone_last4: "0057" })
    .throwOnError();
  const rpc = clientOf(rescuer);
  let { data: step } = await rpc.rpc("accept_case", {
    p_case_id: caseId,
    p_expected_version: item!.version,
  });
  expect(step.status).toBe("ACCEPTED");
  for (const to of ["EN_ROUTE", "ON_SITE", "AWAITING_CONFIRMATION"]) {
    ({ data: step } = await rpc.rpc("advance_case_status", {
      p_case_id: caseId,
      p_expected_version: step.version,
      p_to_status: to,
      ...(to === "AWAITING_CONFIRMATION" ? { p_outcome: "HELPED", p_people_helped: 2 } : {}),
    }));
    expect(step.status, to).toBe("UPDATED");
  }
  const { data: secret } = await db.rpc("confirmation_secret_for_case", { p_case_code: caseCode });
  const { data: confirmed, error } = await db.rpc("reporter_confirm_case", {
    p_case_code: caseCode,
    p_token: secret,
    p_decision: "CONFIRM",
  });
  expect(error).toBeNull();
  expect(confirmed.status).toBe("RESOLVED");
});

test.afterAll(async () => {
  const db = adminDb();
  await closeTestCases([caseId].filter(Boolean));
  await db
    .from("units")
    .update({ is_active: false })
    .in("id", [unitId, otherUnitId].filter(Boolean));
  const users = [rescuer, outsider, admin].filter(Boolean).map((user) => user.id);
  if (users.length) await db.from("users").update({ status: "SUSPENDED" }).in("id", users);
});

test("เคสที่เร็วผิดปกติไม่นับจนแอดมินกดผ่าน แล้วสมาชิกเห็นผลงานที่จอ 375px", async ({
  browser,
}) => {
  const viewport = { width: 375, height: 812 };
  const memberContext = await browser.newContext({ viewport });
  await applySession(memberContext, rescuer);
  const page = await memberContext.newPage();

  // ติดด่าน: ยังไม่นับ
  await page.goto("/unit/dashboard");
  await expect(page.getByTestId("unit-label")).toContainText(`${tag} หน่วยผลงาน`);
  await expect(page.getByTestId("unit-label")).toContainText(`เมือง ${area.province}`);
  await expect(page.getByTestId("stat-helped-all")).toContainText("0");
  await expect(page.getByText("ข้อมูลตัวอย่าง")).toHaveCount(0);

  // แอดมินเห็นเหตุผลที่ติดด่าน (ไม่มีเบอร์) แล้วกดผ่าน
  const adminContext = await browser.newContext();
  await applySession(adminContext, admin);
  const adminPage = await adminContext.newPage();
  await adminPage.goto("/admin");
  const review = adminPage.getByRole("listitem", { name: `เคส ${caseCode}` });
  await expect(review).toContainText("รับเคสถึงช่วยเสร็จไม่ถึง 5 นาที");
  await expect(review).not.toContainText("0895700057");
  await review.getByRole("button", { name: "ผ่าน นับเป็นผลงาน" }).click();
  await expect(review).toHaveCount(0);
  const { count } = await adminDb()
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("case_id", caseId)
    .eq("action", "CASE_PERFORMANCE_APPROVED");
  expect(count).toBe(1);

  // ผ่านด่านแล้วนับ
  await page.reload();
  await expect(page.getByTestId("stat-helped-all")).toContainText("1");
  await expect(page.getByTestId("stat-helped-period")).toContainText("1");
  await expect(page.getByTestId("stat-people")).toContainText("2");
  await expect(page.getByTestId("stat-active")).toContainText("0");
  await expect(page.getByTestId("helped-chart")).toBeVisible();
  await page.getByText("ดูเป็นตาราง").click();
  const table = page.getByRole("table");
  await expect(table.getByRole("columnheader", { name: "น้ำท่วม" })).toBeVisible();
  await expect(table.getByRole("row").last()).toContainText("1");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  // CSV: BOM + ภาษาไทย + ไม่มีเบอร์
  const csv = await page.request.get(`/unit/dashboard/csv?unit=${unitId}`);
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const body = await csv.body();
  expect([...body.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const text = body.toString("utf8");
  expect(text).toContain("ช่วยสำเร็จ (ผู้แจ้งยืนยัน)");
  expect(text).not.toContain("0895700057");

  await memberContext.close();
  await adminContext.close();
});

test("คนนอกหน่วยดูและดาวน์โหลดผลงานหน่วยอื่นไม่ได้", async ({ browser }) => {
  const context = await browser.newContext();
  await applySession(context, outsider);
  const page = await context.newPage();
  await page.goto(`/unit/dashboard?unit=${unitId}`);
  // ขอหน่วยอื่น ได้หน่วยของตัวเองแทน
  await expect(page.getByTestId("unit-label")).toContainText(`${tag} หน่วยอื่น`);
  const csv = await page.request.get(`/unit/dashboard/csv?unit=${unitId}`);
  expect(csv.status()).toBe(403);
  const { data } = await clientOf(outsider)
    .from("unit_daily_stats")
    .select("unit_id")
    .eq("unit_id", unitId);
  expect(data).toEqual([]);
  await context.close();
});

test("แอดมินเปิดหน่วยโชว์ (seed) เห็นป้าย ข้อมูลตัวอย่าง กราฟหลายประเภท และแกนอ่านได้ที่ 375px", async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  await applySession(context, admin);
  const page = await context.newPage();
  await page.goto(`/unit/dashboard?unit=${SHOWCASE_UNIT_ID}`);
  await expect(page.getByText("ข้อมูลตัวอย่าง")).toBeVisible();
  await expect(page.getByTestId("unit-label")).toContainText("(บางรัก กรุงเทพมหานคร)");
  // seed: หน่วยโชว์บางรักมีเคสที่ยังไม่ปิด 3 เคส
  await expect(page.getByTestId("stat-active")).toContainText("3");
  await expect(page.getByTestId("stat-label-helped-period")).toHaveText("ช่วยสำเร็จเดือนนี้");
  const legend = page.getByRole("list", { name: "ประเภทเหตุในกราฟ" });
  for (const type of ["น้ำท่วม", "อุบัติเหตุทางถนน", "เจ็บป่วยฉุกเฉิน", "ไฟไหม้"]) {
    await expect(legend).toContainText(type);
  }
  await expect(page.getByTestId("helped-chart").locator("path").first()).toBeVisible();

  // ตัวหนังสือแกนไม่ต่ำกว่า 12px · จอแคบแสดงเดือนเว้นเดือน (เดือนล่าสุดแสดงเสมอ)
  const labels = page.getByTestId("chart-axis-labels").locator("span");
  await expect(labels).toHaveCount(12);
  const shown = await labels.evaluateAll((items) =>
    items.map((item) => ({
      visible: getComputedStyle(item).visibility === "visible",
      size: parseFloat(getComputedStyle(item).fontSize),
    })),
  );
  expect(shown.filter((label) => label.visible)).toHaveLength(6);
  expect(shown.at(-1)?.visible).toBe(true);
  expect(Math.min(...shown.map((label) => label.size))).toBeGreaterThanOrEqual(12);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.close();
});

test("เลือกเดือนแล้วเห็นกราฟรายวัน (วันที่ 1 ถึงวันสุดท้าย) ตาราง/CSV ตรงช่วง และจำค่าใน URL ที่จอ 375px", async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  await applySession(context, admin);
  const page = await context.newPage();
  await page.goto(`/unit/dashboard?unit=${SHOWCASE_UNIT_ID}`);
  await expect(
    page.getByRole("heading", { name: "ช่วยสำเร็จรายเดือน (12 เดือนล่าสุด)" }),
  ).toBeVisible();

  // เดือนที่แล้ว (ตัวเลือกที่ 2) — หน่วยโชว์มีเคสทุกวันในช่วงนั้น
  const period = page.getByLabel("ช่วงเวลา");
  const option = period.locator("option").nth(2);
  const month = (await option.getAttribute("value"))!;
  const monthLabel = (await option.textContent())!;
  await period.selectOption(month);
  await page.getByRole("button", { name: "ดูผลงาน" }).click();
  await expect(page).toHaveURL(new RegExp(`[?&]month=${month}`));
  await expect(page.getByRole("heading", { name: `ช่วยสำเร็จรายวัน ${monthLabel}` })).toBeVisible();
  await expect(period).toHaveValue(month);
  // ช่องที่ 2 เปลี่ยนเป็นยอดของเดือนที่เลือก ช่องอื่นคงเดิม
  await expect(page.getByTestId("stat-label-helped-period")).toHaveText(`ช่วยสำเร็จ ${monthLabel}`);
  await expect(page.getByTestId("stat-label-active")).toHaveText("กำลังช่วย");
  await expect(page.getByTestId("stat-label-helped-all")).toHaveText("ช่วยสำเร็จทั้งหมด");

  const [year, monthNumber] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  await expect(page.getByTestId("chart-axis-labels").locator("span")).toHaveCount(days);
  // ป้ายแรกมีชื่อเดือน ("1 ต.ค.") ที่เหลือเป็นเลขวัน · 12px ไม่ทับกัน ไม่ล้นจอ
  const shown = await expectReadableAxis(page);
  expect(shown[0]).toMatch(/^1 [ก-๙.]+$/);
  expect(shown.map((text) => text.split(" ")[0])).toEqual(
    ["1", "5", "10", "15", "20", "25", "30"].filter((day) => Number(day) <= days),
  );

  // ตารางและ CSV เป็นรายวันของเดือนเดียวกัน
  await page.getByText("ดูเป็นตาราง").click();
  const table = page.getByRole("table");
  await expect(table.getByRole("columnheader", { name: "วันที่" })).toBeVisible();
  await expect(table.locator("tbody tr")).toHaveCount(days);
  // ตัวเลขในช่องเท่ากับผลรวมคอลัมน์ "ช่วยสำเร็จ" ในตาราง
  const helpedColumn = await table
    .locator("tbody tr")
    .evaluateAll((rows) => rows.map((row) => Number(row.querySelectorAll("td")[0]?.textContent)));
  const tableSum = helpedColumn.reduce((total, value) => total + value, 0);
  expect(tableSum).toBeGreaterThan(0);
  await expect(page.getByTestId("stat-helped-period")).toContainText(
    tableSum.toLocaleString("th-TH"),
  );
  const csvLink = page.getByRole("link", { name: "ดาวน์โหลดตัวเลขช่วงนี้ (CSV)" });
  await expect(csvLink).toHaveAttribute("href", new RegExp(`month=${month}`));
  const csv = await page.request.get((await csvLink.getAttribute("href"))!);
  const lines = (await csv.text()).replace(/^﻿/, "").trimEnd().split("\r\n");
  expect(lines[0]).toContain(",วันที่,");
  expect(lines).toHaveLength(days + 1);
  expect(lines[1]).toContain(`,${month}-01,`);
  await context.close();
});
