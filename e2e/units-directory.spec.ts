import { expect, test, type Locator } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { adminDb } from "./helpers/db";
import { applySession, createAccount, type TestAccount } from "./helpers/accounts";
import { expectReadableAxis } from "./helpers/chart";

/**
 * TF-61 หน้าสาธารณะ /units + /units/[id] และ TF-71 ตัวเลือกหน่วย
 * ใช้หน่วยโชว์จาก seed ของ TF-57 (ข้อมูลตัวอย่าง) เพราะรายชื่อหน่วยแคช 60 วินาที
 * หน่วยที่ test สร้างใหม่จึงเปิดผ่านหน้ารายละเอียดตรงๆ (แคชแยกตาม id)
 */
test.describe.configure({ mode: "serial" });

const SHOWCASE_BANGRAK = "d5630000-0000-4000-8000-000000000001";
const SHOWCASE_LADPRAO = "d5630000-0000-4000-8000-000000000002";
const MOBILE = { width: 375, height: 812 };

let tag: string;
let admin: TestAccount;
let osmUnitId: string;

test.beforeAll(async ({}, testInfo) => {
  tag = `TF61${testInfo.project.name[0]}${crypto.randomUUID().slice(0, 6)}`;
  admin = await createAccount({ displayName: `${tag} แอดมิน`, role: "ADMIN" });
  const { data } = await adminDb()
    .from("units")
    .insert({
      name: `${tag} มูลนิธิจาก OSM`,
      branch_name: `${tag} ศูนย์จาก OSM`,
      province: "ตราด",
      district: "เกาะช้าง",
      contact_phone: "1554",
      source: "OSM",
      osm_id: `node/${Date.now()}${Math.floor(Math.random() * 1000)}`,
      is_active: false,
    })
    .select("id")
    .single()
    .throwOnError();
  osmUnitId = data!.id;
});

test.afterAll(async () => {
  if (osmUnitId) await adminDb().from("units").delete().eq("id", osmUnitId);
  if (admin) await adminDb().from("users").update({ status: "SUSPENDED" }).eq("id", admin.id);
});

const noHorizontalScroll = (locator: Locator) =>
  locator.page().evaluate(() => document.documentElement.scrollWidth <= innerWidth);

test("/units เปิดได้โดยไม่ล็อกอิน กรองจังหวัด → อำเภอ องค์กร ความสามารถ และจำค่าใน URL ที่จอ 375px", async ({
  page,
}) => {
  await page.setViewportSize(MOBILE);
  await page.goto("/units");
  await expect(page.getByRole("heading", { level: 1, name: "หน่วยกู้ภัย" })).toBeVisible();
  await expect(page).toHaveURL(/\/units$/); // ไม่ถูกพาไปหน้า login

  await page.locator('select[name="province"]').selectOption({ label: "กรุงเทพมหานคร" });
  const district = page.locator('select[name="district"]');
  await expect(district.locator("option", { hasText: "บางรัก" })).toHaveCount(1);
  await district.selectOption({ label: "บางรัก" });
  await page.locator('select[name="org"]').selectOption({ label: "องค์กรสมมติ สายนที" });
  await page.locator('select[name="cap"]').selectOption({ label: "เรือ" });
  await page.getByRole("button", { name: "ค้นหา", exact: true }).click();

  await expect(page).toHaveURL(/[?&]province=10(&|$)/);
  await expect(page).toHaveURL(/[?&]district=\d+/);
  await expect(page).toHaveURL(/[?&]cap=BOAT/);
  await expect(page.getByTestId("units-count")).toHaveText("พบ 1 หน่วย");
  const card = page.getByTestId("unit-card");
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("องค์กรสมมติ สายนที · ศูนย์สมมติ สายนที (บางรัก กรุงเทพมหานคร)");
  await expect(card).toContainText("ข้อมูลตัวอย่าง");
  await expect(card).toContainText("เรือ");

  // โหลดใหม่ ตัวกรองยังอยู่
  await page.reload();
  await expect(page.locator('select[name="province"]')).toHaveValue("10");
  await expect(district).not.toHaveValue("");
  await expect(page.locator('select[name="cap"]')).toHaveValue("BOAT");
  expect(await noHorizontalScroll(card)).toBe(true);

  // ค้นด้วยชื่อ (ล้างตัวกรองอื่นก่อน)
  await page.getByRole("link", { name: "ล้างตัวกรอง" }).click();
  await expect(page).toHaveURL(/\/units$/);
  await page.getByLabel("ค้นด้วยชื่อ").fill("สายนที ลาดพร้าว");
  await page.getByRole("button", { name: "ค้นหา", exact: true }).click();
  await expect(page).toHaveURL(/[?&]q=/);
  await expect(page.getByTestId("unit-card")).toHaveCount(1);
  await expect(page.getByTestId("unit-card")).toContainText("(ลาดพร้าว กรุงเทพมหานคร)");

  // หน้าเว็บไม่มีรหัสเคสหรือพิกัดเคสของหน่วยโชว์
  const html = await page.content();
  expect(html).not.toMatch(/DEMO-S\d-/);
  expect(html).not.toContain("13.8162");

  // ลิงก์ใน footer
  await expect(
    page.getByRole("contentinfo").getByRole("link", { name: "หน่วยกู้ภัย" }),
  ).toHaveAttribute("href", "/units");
});

test("TF-71 ตัวเลือกหน่วย: จัดกลุ่มตามจังหวัด ชื่ออ่านได้ครบที่ 375px และเลือกด้วยแป้นพิมพ์", async ({
  page,
}) => {
  await page.setViewportSize(MOBILE);
  await page.goto("/units");
  const button = page.getByTestId("unit-picker-button");
  await button.click();
  const search = page.getByRole("combobox", { name: "ค้นหาไปที่หน่วยโดยตรง" });
  await expect(search).toBeFocused();
  await search.fill("สายนที กรุงเทพ");

  const listbox = page.getByRole("listbox");
  await expect(listbox.getByRole("group", { name: "กรุงเทพมหานคร" })).toBeVisible();
  const options = listbox.getByRole("option");
  await expect(options).toHaveCount(2);
  // ชื่อเต็มขึ้นบรรทัดใหม่ ไม่ถูกตัด และไม่ล้นจอ
  for (const option of await options.all()) {
    await expect(option).toContainText("องค์กรสมมติ สายนที · ศูนย์สมมติ สายนที (");
    await expect(option).toContainText("ข้อมูลตัวอย่าง");
    const box = await option.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(MOBILE.width);
    expect(await option.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  }

  // Esc ปิดและคืนโฟกัสให้ปุ่ม
  await search.press("Escape");
  await expect(listbox).toHaveCount(0);
  await expect(button).toBeFocused();

  // ลูกศรลง + Enter เลือกตัวที่ 2 (ลาดพร้าว) → ไปหน้าหน่วยนั้น
  await button.press("Enter");
  await page.keyboard.type("สายนที กรุงเทพ");
  await page.keyboard.press("ArrowDown");
  await expect(search).toHaveAttribute("aria-activedescendant", /option-1$/);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/units/${SHOWCASE_LADPRAO}$`));
  await expect(page.getByTestId("unit-label")).toContainText("(ลาดพร้าว กรุงเทพมหานคร)");
});

test("/units/[id] กราฟ 30 วัน 2 สี แตะแท่งเห็นวันที่และจำนวน มีตารางและตัวเลขสรุป 4 ช่อง", async ({
  page,
  isMobile,
}) => {
  await page.setViewportSize(MOBILE);
  await page.goto(`/units/${SHOWCASE_BANGRAK}`);
  await expect(page.getByTestId("unit-label")).toContainText(
    "องค์กรสมมติ สายนที · ศูนย์สมมติ สายนที (บางรัก กรุงเทพมหานคร)",
  );
  await expect(page.getByText("ข้อมูลตัวอย่าง")).toBeVisible();
  for (const key of ["active", "helped-30d", "helped-all", "people"]) {
    await expect(page.getByTestId(`stat-${key}`)).toBeVisible();
  }
  // seed: หน่วยโชว์บางรักมีเคสที่ยังไม่ปิด 3 เคส
  await expect(page.getByTestId("stat-active")).toContainText("3");

  const legend = page.getByRole("list", { name: "คำอธิบายสี" });
  await expect(legend).toContainText("ผู้แจ้งยืนยัน");
  await expect(legend).toContainText("หัวหน้าปิด");
  const slots = page.getByTestId("chart-slot");
  await expect(slots).toHaveCount(30);
  await expect(page.getByTestId("chart-axis-labels").locator("span")).toHaveCount(30);
  // แกน X: ป้ายแรก/วันขึ้นเดือนใหม่มีชื่อเดือน ("12 ต.ค." "1 พ.ย.") 12px ไม่ทับกัน ไม่ล้นจอ ทั้งจอแคบและจอกว้าง
  // 30 วันข้ามเดือนเสมอ จึงต้องมีป้าย "1 <เดือน>" (ถ้าเริ่มวันที่ 1 ก็คือป้ายแรก)
  for (const width of [MOBILE.width, 1280]) {
    await page.setViewportSize({ ...MOBILE, width });
    const shown = await expectReadableAxis(page);
    expect(
      shown.some((text) => /^1 [ก-๙.]+$/.test(text)),
      shown.join(","),
    ).toBe(true);
    expect(shown.filter((text) => !/^\d+( [ก-๙.]+)?$/.test(text))).toEqual([]);
  }
  await page.setViewportSize(MOBILE);

  // ตาราง 30 แถว ผลรวมคอลัมน์ผู้แจ้งยืนยัน = ช่อง "ช่วยสำเร็จ 30 วัน"
  await page.getByText("ดูเป็นตาราง").click();
  const rows = page.getByRole("table").locator("tbody tr");
  await expect(rows).toHaveCount(30);
  const values = await rows.evaluateAll((items) =>
    items.map((row) => ({
      label: row.querySelector("th")!.textContent!,
      helped: Number(row.querySelectorAll("td")[0].textContent),
      leadClosed: Number(row.querySelectorAll("td")[1].textContent),
    })),
  );
  const sum = values.reduce((total, row) => total + row.helped, 0);
  expect(sum).toBeGreaterThan(0);
  await expect(page.getByTestId("stat-helped-30d")).toContainText(sum.toLocaleString("th-TH"));

  // แตะแท่งสุดท้าย (วันนี้) เห็นวันที่และตัวเลขตรงกับตาราง
  const readout = page.getByTestId("chart-readout");
  await expect(readout).toContainText("แตะที่แท่ง");
  if (isMobile) await slots.last().tap();
  else await slots.last().click();
  const today = values.at(-1)!;
  // แถบตัวเลขใช้ปี พ.ศ. เต็ม ("21 ต.ค. 69" ในตาราง → "21 ต.ค. 2569") และวันที่อยู่บรรทัดเดียว
  const fullYear = (label: string) => label.replace(/ (\d{2})$/, " 25$1");
  await expect(readout).toContainText(fullYear(today.label));
  const date = readout.getByText(fullYear(today.label), { exact: true });
  expect(await date.evaluate((el) => el.getClientRects().length)).toBe(1);
  await expect(readout).toContainText(`ผู้แจ้งยืนยัน ${today.helped}`);
  await expect(readout).toContainText(`หัวหน้าปิด ${today.leadClosed}`);

  // ลูกศรซ้ายเลื่อนไปวันก่อนหน้า
  await page.getByRole("group", { name: /ใช้ลูกศรซ้ายขวา/ }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(readout).toContainText(fullYear(values.at(-2)!.label));
  expect(await noHorizontalScroll(readout)).toBe(true);
});

test("หน่วย OSM ที่ยังไม่ได้ใช้ระบบ: ป้าย ไม่มีกราฟ มีสายด่วนและเครดิต OpenStreetMap", async ({
  page,
}) => {
  await page.goto(`/units/${osmUnitId}`);
  await expect(page.getByTestId("unit-label")).toContainText(`${tag} ศูนย์จาก OSM (เกาะช้าง ตราด)`);
  await expect(page.getByText("ยังไม่ได้ใช้ระบบ", { exact: true })).toBeVisible();
  await expect(page.getByTestId("helped-chart")).toHaveCount(0);
  await expect(page.getByTestId("stat-helped-all")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "โทรสายด่วน 1554" })).toHaveAttribute(
    "href",
    "tel:1554",
  );
  await expect(page.getByTestId("osm-credit")).toContainText("© OpenStreetMap contributors");
});

test("RPC สาธารณะ: anon ได้แค่คอลัมน์ที่กำหนด และอ่านตารางหน่วย/เคสตรงไม่ได้", async () => {
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
  const directoryColumns = [
    "id",
    "organization_name",
    "branch_name",
    "district",
    "province",
    "capabilities",
    "source",
    "in_service",
    "hotline",
    "helped_total",
  ];
  const { data: list, error } = await anon.rpc("public_unit_directory");
  expect(error).toBeNull();
  expect(list.length).toBeGreaterThan(0);
  expect(Object.keys(list[0]).sort()).toEqual([...directoryColumns].sort());
  expect(
    list.filter(
      (unit: { source: string; hotline: string | null }) => unit.source !== "OSM" && unit.hotline,
    ),
  ).toEqual([]);

  const { data: profile } = await anon.rpc("public_unit_profile", { p_unit_id: SHOWCASE_BANGRAK });
  expect(Object.keys(profile[0]).sort()).toEqual(
    [
      ...directoryColumns,
      "lead_closed_total",
      "helped_30d",
      "lead_closed_30d",
      "people_helped",
      "active_count",
    ].sort(),
  );

  for (const table of ["units", "cases", "unit_capabilities", "unit_members"]) {
    const { data } = await anon.from(table).select("*").limit(1);
    expect(data ?? [], table).toEqual([]);
  }
});

test("TF-71 /unit/dashboard ใช้ตัวเลือกหน่วยเดียวกัน ชื่อเต็มที่จอ 375px", async ({ browser }) => {
  const context = await browser.newContext({ viewport: MOBILE });
  await applySession(context, admin);
  const page = await context.newPage();
  await page.goto("/unit/dashboard");
  const button = page.getByTestId("unit-picker-button");
  await button.click();
  await page.keyboard.type("สายนที บางรัก");
  const option = page.getByRole("listbox").getByRole("option");
  await expect(option).toHaveCount(1);
  expect(await option.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.keyboard.press("Enter");
  // ปุ่มแสดงชื่อเต็ม (ขึ้นบรรทัดใหม่ได้) ไม่ถูกตัด
  await expect(button).toContainText(
    "องค์กรสมมติ สายนที · ศูนย์สมมติ สายนที (บางรัก กรุงเทพมหานคร)",
  );
  expect(await button.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.getByRole("button", { name: "ดูผลงาน" }).click();
  await expect(page).toHaveURL(new RegExp(`[?&]unit=${SHOWCASE_BANGRAK}`));
  await expect(page.getByTestId("unit-label")).toContainText("(บางรัก กรุงเทพมหานคร)");
  expect(await noHorizontalScroll(button)).toBe(true);
  await context.close();
});
