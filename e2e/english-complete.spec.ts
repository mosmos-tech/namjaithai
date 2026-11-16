import { expect, test, type Page } from "@playwright/test";
import { adminDb } from "./helpers/db";

const SHOWCASE_BANGRAK = "d5630000-0000-4000-8000-000000000001";

let seededActiveOrgId = "";
let seededActiveOrgName = "";
let seededActiveUnitId = "";
let seededDemoOrgId = "";
let seededDemoOrgName = "";
let seededDemoUnitId = "";

test.beforeAll(async ({}, testInfo) => {
  const db = adminDb();
  const tag = `${testInfo.project.name}-${crypto.randomUUID().slice(0, 6)}`;

  const { data: activeOrg, error: activeOrgErr } = await db
    .from("organizations")
    .insert({
      name: `มูลนิธิทดสอบ TF79 (${tag})`,
      is_demo: false,
    })
    .select("id, name")
    .single();
  if (activeOrgErr) throw activeOrgErr;
  seededActiveOrgId = activeOrg.id;
  seededActiveOrgName = activeOrg.name;

  const { data: activeUnit, error: activeUnitErr } = await db
    .from("units")
    .insert({
      name: "ศูนย์คลองเตย",
      branch_name: "ศูนย์คลองเตย",
      organization_id: seededActiveOrgId,
      province: "กรุงเทพมหานคร",
      district: "คลองเตย",
      contact_phone: "021234567",
      source: "ADMIN",
      is_active: true,
    })
    .select("id")
    .single();
  if (activeUnitErr) throw activeUnitErr;
  seededActiveUnitId = activeUnit.id;

  const { error: activeCapErr } = await db.from("unit_capabilities").insert([
    { unit_id: seededActiveUnitId, capability: "BOAT" },
    { unit_id: seededActiveUnitId, capability: "WATER_RESCUE" },
  ]);
  if (activeCapErr) throw activeCapErr;

  const { data: demoOrg, error: demoOrgErr } = await db
    .from("organizations")
    .insert({
      name: `มูลนิธิตัวอย่าง TF79 (${tag})`,
      is_demo: true,
    })
    .select("id, name")
    .single();
  if (demoOrgErr) throw demoOrgErr;
  seededDemoOrgId = demoOrg.id;
  seededDemoOrgName = demoOrg.name;

  const { data: demoUnit, error: demoUnitErr } = await db
    .from("units")
    .insert({
      name: "ศูนย์บางเขน",
      branch_name: "ศูนย์บางเขน",
      organization_id: seededDemoOrgId,
      province: "กรุงเทพมหานคร",
      district: "บางเขน",
      source: "DEMO",
      is_active: true,
    })
    .select("id")
    .single();
  if (demoUnitErr) throw demoUnitErr;
  seededDemoUnitId = demoUnit.id;

  const { error: demoCapErr } = await db
    .from("unit_capabilities")
    .insert([{ unit_id: seededDemoUnitId, capability: "EMS" }]);
  if (demoCapErr) throw demoCapErr;
});

test.afterAll(async () => {
  const db = adminDb();
  const unitIds = [seededActiveUnitId, seededDemoUnitId].filter(Boolean);
  const orgIds = [seededActiveOrgId, seededDemoOrgId].filter(Boolean);
  if (unitIds.length > 0) {
    await db.from("unit_capabilities").delete().in("unit_id", unitIds);
    await db.from("units").delete().in("id", unitIds);
  }
  if (orgIds.length > 0) {
    await db.from("organizations").delete().in("id", orgIds);
  }
});

test("TF-79 Test 1: EN Navbar (5 ลิงก์ครบ), Footer link และแบนเนอร์ PWA Install/Offline บน /en", async ({
  page,
  context,
}) => {
  await page.goto("/en/request");
  await expect(page.getByText("Step 1 of 5")).toBeVisible();

  const nav = page.locator("header nav");
  const openMenu = nav.getByRole("button", { name: "Open menu" });
  if (await openMenu.isVisible()) {
    await openMenu.click();
  }

  const expectedNavLinks = [
    { label: "Request help", href: "/en/request" },
    { label: "Track a case", href: "/en/track" },
    { label: "Hotlines", href: "/en/hotlines" },
    { label: "Rescue units", href: "/en/units" },
    { label: "Survival guide", href: "/en/survival" },
  ];
  for (const item of expectedNavLinks) {
    const link = nav.getByRole("link", { name: item.label, exact: true });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", item.href);
  }

  const footer = page.locator("footer:not([data-root-footer])");
  await expect(footer).toBeVisible();
  const footerUnitsLink = footer.getByRole("link", { name: "Rescue units", exact: true });
  await expect(footerUnitsLink).toBeVisible();
  await expect(footerUnitsLink).toHaveAttribute("href", "/en/units");
  await expect(footer).not.toContainText("Rescue units (in Thai)");

  await page.evaluate(() => {
    localStorage.removeItem("namjaithai:pwa-dismissed-at");
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt: async () => {},
      userChoice: Promise.resolve({ outcome: "dismissed" }),
    });
    window.dispatchEvent(event);
  });

  const installBanner = page.getByRole("complementary", { name: "Add to Home Screen" });
  await expect(installBanner).toBeVisible();
  await expect(installBanner).toContainText("Add Namjai Thai to your Home Screen");
  const isIosUa = await page.evaluate(() => /iPhone|iPad|iPod/.test(navigator.userAgent));
  if (isIosUa) {
    await expect(
      installBanner.getByRole("button", { name: "How to add", exact: true }),
    ).toBeVisible();
  } else {
    await expect(
      installBanner.getByRole("button", { name: "Add to Home Screen", exact: true }),
    ).toBeVisible();
  }
  const notNowButton = installBanner.locator("button", { hasText: "Not now" });
  await expect(notNowButton).toBeVisible();
  await notNowButton.click();
  await expect(installBanner).toHaveCount(0);

  await context.setOffline(true);
  try {
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Offline: You can fill out and save an SOS request on this device." }),
    ).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test("TF-79 Test 2: /en/survival คู่มือ 3 ช่วง เช็กลิสต์ 72 ชม. ใช้ความคืบหน้าร่วมกับหน้าไทย สลับภาษา และไม่ล้นจอ", async ({
  page,
}) => {
  await page.goto("/en/survival");
  await page.evaluate(() => localStorage.removeItem("survival-checklist-v1"));
  await page.reload();

  await expect(page.getByRole("heading", { name: "Flood survival guide" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "72-hour emergency checklist" })).toBeVisible();
  await expect(page.getByTestId("hydration-pending")).toHaveCount(0);

  const phases = ["Before the flood", "During the flood", "After the water recedes"];
  for (const phase of phases) {
    const details = page.locator("details").filter({ hasText: phase });
    const summary = details.locator("summary");
    await expect(summary).toBeVisible();
    await summary.click();
    await expect(details).toHaveAttribute("open", "");
    await expect(details.locator("ol > li")).toHaveCount(5);
  }
  await expect(page.locator("details ol > li")).toHaveCount(15);

  const checkboxes = page.getByRole("checkbox");
  await expect(checkboxes).toHaveCount(12);
  await expect(page.getByText("0/12 items")).toBeVisible();

  const firstCheckbox = page.getByRole("checkbox", {
    name: "Drinking water: 3 liters per person per day (at least 3 days)",
  });
  await firstCheckbox.check();
  await expect(firstCheckbox).toBeChecked();
  await expect(page.getByText("1/12 items")).toBeVisible();

  await page.getByTestId("language-switch").getByRole("link", { name: "ไทย" }).click();
  await expect(page).toHaveURL(/\/survival$/);
  await expect(page).not.toHaveURL(/\/en\//);
  await expect(page.getByRole("heading", { name: "คู่มือเอาตัวรอดจากน้ำท่วม" })).toBeVisible();
  await expect(page.getByText("1/12 รายการ")).toBeVisible();

  await page.getByTestId("language-switch").getByRole("link", { name: "EN" }).click();
  await expect(page).toHaveURL(/\/en\/survival$/);
  await expect(page.getByRole("heading", { name: "Flood survival guide" })).toBeVisible();
  await expect(page.getByText("1/12 items")).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("TF-79 Test 3: /en/units และ /en/units/[id] ตัวกรอง ความสามารถ ชื่อจังหวัด/เขตภาษาอังกฤษ ป้าย Demo กราฟ 30 วัน สลับภาษา และไม่ล้นจอ", async ({
  page,
}) => {
  await page.goto("/en/units");
  await expect(page.getByRole("heading", { level: 1, name: "Rescue units" })).toBeVisible();

  const filterForm = page.getByRole("form", { name: "Filter rescue units" });
  await expect(filterForm).toBeVisible();
  for (const label of ["Search by name", "Province", "District", "Organization", "Capability"]) {
    await expect(filterForm).toContainText(label);
  }

  const provinceSelect = filterForm.locator('select[name="province"]');
  await expect(provinceSelect.locator("option", { hasText: "Bangkok" })).toHaveCount(1);
  await provinceSelect.selectOption("10");

  const districtSelect = filterForm.locator('select[name="district"]');
  await expect(districtSelect.locator("option", { hasText: "Khlong Toei" })).toHaveCount(1);
  await expect(districtSelect.locator("option", { hasText: "Bang Rak" })).toHaveCount(1);

  const capSelect = filterForm.locator('select[name="cap"]');
  await capSelect.selectOption({ label: "Flat-bottom / rescue boat" });
  await filterForm.getByRole("button", { name: "Search", exact: true }).click();

  await expect(page).toHaveURL(/\/en\/units\?.*province=10.*cap=BOAT/);

  const cards = page.getByTestId("unit-card");
  await expect(cards.first()).toBeVisible();
  const bangrakCard = cards.filter({
    hasText: "องค์กรสมมติ สายนที · ศูนย์สมมติ สายนที (Bang Rak, Bangkok)",
  });
  await expect(bangrakCard).toBeVisible();
  await expect(bangrakCard).toContainText("Flat-bottom / rescue boat");
  await expect(bangrakCard).toContainText("Water rescue");
  await expect(bangrakCard).toContainText("Demo data");

  await page.getByTestId("language-switch").getByRole("link", { name: "ไทย" }).click();
  await expect(page).toHaveURL(/\/units\?province=10&cap=BOAT$/);
  await expect(page).not.toHaveURL(/\/en\//);
  await expect(page.getByRole("heading", { level: 1, name: "หน่วยกู้ภัย" })).toBeVisible();
  await expect(page.getByTestId("units-count")).toBeVisible();

  await page.getByTestId("language-switch").getByRole("link", { name: "EN" }).click();
  await expect(page).toHaveURL(/\/en\/units\?.*province=10.*cap=BOAT/);
  await expect(page.getByRole("heading", { level: 1, name: "Rescue units" })).toBeVisible();
  await expect(page.getByTestId("units-count")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  // ตรวจหน่วยตัวอย่างที่ seed ใน beforeAll (TF-70 Demo data badge + พื้นที่ Bang Khen, Bangkok)
  await page.goto(`/en/units/${seededDemoUnitId}`);
  await expect(page.getByTestId("unit-label")).toHaveText(
    `${seededDemoOrgName} · ศูนย์บางเขน (Bang Khen, Bangkok)`,
  );
  await expect(page.getByText("Demo data", { exact: true })).toBeVisible();
  await expect(page.getByText("EMS / First aid")).toBeVisible();

  // ตรวจหน่วยจริงที่ seed ใน beforeAll (คลองเตย กรุงเทพมหานคร → Khlong Toei, Bangkok)
  await page.goto(`/en/units/${seededActiveUnitId}`);
  const expectedActiveLabelEn = `${seededActiveOrgName} · ศูนย์คลองเตย (Khlong Toei, Bangkok)`;
  const expectedActiveLabelTh = `${seededActiveOrgName} · ศูนย์คลองเตย (คลองเตย กรุงเทพมหานคร)`;
  await expect(page.getByRole("link", { name: "← All rescue units" })).toHaveAttribute(
    "href",
    "/en/units",
  );
  await expect(page.getByTestId("unit-label")).toHaveText(expectedActiveLabelEn);
  await expect(page.getByText("Flat-bottom / rescue boat")).toBeVisible();
  await expect(page.getByText("Water rescue")).toBeVisible();

  for (const label of ["Currently helping", "Helped (30 days)", "Total helped", "People helped"]) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }

  await expect(page.getByRole("heading", { name: "Last 30 days of relief" })).toBeVisible();
  const legend = page.getByRole("list", { name: "Legend" });
  await expect(legend).toContainText("Confirmed by reporter");
  await expect(legend).toContainText("Closed by unit lead");
  await expect(page.getByText("View as table")).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  await page.getByTestId("language-switch").getByRole("link", { name: "ไทย" }).click();
  await expect(page).toHaveURL(new RegExp(`/units/${seededActiveUnitId}$`));
  await expect(page).not.toHaveURL(/\/en\//);
  await expect(page.getByTestId("unit-label")).toHaveText(expectedActiveLabelTh);

  await page.getByTestId("language-switch").getByRole("link", { name: "EN" }).click();
  await expect(page).toHaveURL(new RegExp(`/en/units/${seededActiveUnitId}$`));
  await expect(page.getByTestId("unit-label")).toHaveText(expectedActiveLabelEn);
});

async function assertNoUnexpectedThaiOnEnglishPage(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  if (path.startsWith("/en/units/")) {
    await expect(page.getByTestId("unit-label")).toBeVisible();
  } else if (path.startsWith("/en/units")) {
    await expect(page.getByTestId("units-count")).toBeVisible();
  }
  await expect(page.getByTestId("hydration-pending")).toHaveCount(0);
  await expect(page.locator("header nav [aria-busy='true']")).toHaveCount(0);

  const inspection = await page.evaluate(() => {
    const unitLinks = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-testid="unit-card"] > a, [data-testid="unit-label"]',
      ),
    );
    const suffixes: string[] = [];
    const savedUnitTexts = new Map<HTMLElement, string>();
    for (const el of unitLinks) {
      const text = el.textContent?.trim() ?? "";
      savedUnitTexts.set(el, el.textContent ?? "");
      const match = text.match(/\(([^()]+)\)\s*$/);
      suffixes.push(match ? match[1] : "");
      if (match) el.textContent = `(${match[1]})`;
    }

    const orgOptions = Array.from(
      document.querySelectorAll<HTMLOptionElement>('select[name="org"] option'),
    );
    const savedOptionTexts = new Map<HTMLOptionElement, string>();
    for (const opt of orgOptions) {
      if (opt.value !== "") {
        savedOptionTexts.set(opt, opt.textContent ?? "");
        opt.textContent = "";
      }
    }

    try {
      let text = document.body.innerText;
      for (const allowed of ["น้ำใจไทย", "ภาษาไทย", "ไทย"]) {
        text = text.replaceAll(allowed, "");
      }
      const thaiMatches = text.match(/[\u0E00-\u0E7F]+/g) ?? [];
      return { suffixes, thaiMatches };
    } finally {
      for (const [el, orig] of savedUnitTexts) el.textContent = orig;
      for (const [opt, orig] of savedOptionTexts) opt.textContent = orig;
    }
  });

  for (const suffix of inspection.suffixes) {
    expect(suffix, `Area suffix on ${path} must be non-empty`).toBeTruthy();
    expect(suffix, `Area suffix on ${path} must be English`).not.toMatch(/[\u0E00-\u0E7F]/);
  }
  expect(inspection.thaiMatches, `Unexpected Thai text on ${path}`).toEqual([]);
}

test("TF-79 Test 4: ไม่มีภาษาไทยหลงเหลือในหน้า /en ยกเว้นชื่อแบรนด์ ปุ่มสลับภาษา และชื่อองค์กร/สาขาของหน่วย (Criterion 5)", async ({
  page,
}) => {
  const paths = [
    "/en/request",
    "/en/sos",
    "/en/hotlines",
    "/en/track",
    "/en/survival",
    "/en/units?province=10&cap=BOAT",
    `/en/units/${SHOWCASE_BANGRAK}`,
    `/en/units/${seededActiveUnitId}`,
    `/en/units/${seededDemoUnitId}`,
  ];
  for (const path of paths) {
    await assertNoUnexpectedThaiOnEnglishPage(page, path);
  }
});
