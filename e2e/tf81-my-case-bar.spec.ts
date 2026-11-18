import { expect, test } from "@playwright/test";
import {
  adminDb,
  closeTestCases,
  randomPhone,
  stepTestCase,
} from "./helpers/db";
import { applySession, createAccount, type TestAccount } from "./helpers/accounts";
import { goToStep5, openFreshSosForm } from "./helpers/sos";

test.describe.configure({ mode: "serial" });
test.setTimeout(90_000);

const PROVINCE = "สิงห์บุรี";
const STORAGE_KEY = "namjaithai:confirmation-cases";

const createdCaseIds: string[] = [];
let staffUser: TestAccount | undefined;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("namjaithai-onboarding-seen-v1", "true");
  });
});

test.afterAll(async () => {
  const db = adminDb();
  if (createdCaseIds.length > 0) {
    try {
      await closeTestCases(createdCaseIds);
    } catch {
      /* ignore cleanup error */
    }
  }
  if (staffUser) {
    try {
      await db.from("users").update({ status: "SUSPENDED" }).eq("id", staffUser.id);
    } catch {
      /* ignore cleanup error */
    }
  }
});

async function createDbCase(params: {
  status?: string;
  tag?: string;
  landmark?: string;
}): Promise<{ id: string; code: string; trackingToken: string; confirmationToken: string }> {
  const db = adminDb();
  const randNum = Math.floor(Math.random() * 800_000) + 100_000;
  const code = `FL-2611-${randNum}`;
  const status = params.status ?? "NEW";

  const { data, error } = await db
    .from("cases")
    .insert({
      case_code: code,
      urgency: "YELLOW",
      status,
      lat: 14.89,
      lng: 100.4,
      province: PROVINCE,
      landmark: params.landmark ?? "TF-81 จุดทดสอบ",
      incident_type: "FLOOD",
    })
    .select("id, case_code, tracking_token")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create DB test case: ${error?.message}`);
  }

  createdCaseIds.push(data.id);

  const secretRes = await db.rpc("confirmation_secret_for_case", { p_case_code: code });
  if (secretRes.error || !secretRes.data) {
    throw new Error(`Failed to fetch confirmation secret for ${code}: ${secretRes.error?.message}`);
  }

  return {
    id: data.id,
    code: data.case_code,
    trackingToken: data.tracking_token,
    confirmationToken: secretRes.data as string,
  };
}

test.describe("TF-81: End-to-End Journey & Review Focus #3 In-Session Activation", () => {
  test("empty storage -> submits SOS -> bar appears below header without PII -> tracks -> dismisses -> confirms and resolves", async ({
    page,
    isMobile,
  }) => {
    // 1) Review Focus #3: Load / with empty localStorage
    let trackApiRequests = 0;
    page.on("request", (req) => {
      if (req.url().includes("/api/track")) trackApiRequests++;
    });

    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("namjaithai-onboarding-seen-v1", "true");
    });
    await page.reload();

    await expect(page.getByTestId("my-case-bar")).toHaveCount(0);
    expect(trackApiRequests).toBe(0);

    // 2) Submit real SOS via /request
    const phone = randomPhone();
    await openFreshSosForm(page, "/request");
    await goToStep5(page);

    await page.getByPlaceholder("เช่น สมชาย ใจดี (หรือชื่อเล่น)").fill("ผู้แจ้งทดสอบ TF81");
    await page.getByPlaceholder("เช่น 0812345678 หรือ 081-234-5678").fill(phone);
    await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลเพื่อ/ }).check();
    await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลสุขภาพ/ }).check();

    const caseSubmitted = page.waitForResponse(
      (res) => res.url().includes("/api/cases") && res.request().method() === "POST",
    );
    await page.getByTestId("step5-submit-button").click();
    const caseResponse = await caseSubmitted;
    expect(caseResponse.ok()).toBeTruthy();

    const caseData = (await caseResponse.json()) as { caseCode: string; trackingToken: string };
    const caseCode = caseData.caseCode;
    const trackingToken = caseData.trackingToken;

    // Save ID for cleanup
    const dbCase = await adminDb().from("cases").select("id").eq("case_code", caseCode).single();
    if (dbCase.data) createdCaseIds.push(dbCase.data.id);

    // In-session loader activation: bar appears in-session right after submit!
    const bar = page.getByTestId("my-case-bar");
    await expect(bar).toBeVisible({ timeout: 15_000 });

    // Scroll to top to inspect positioning below <header>
    await page.evaluate(() => window.scrollTo(0, 0));
    const header = page.locator("header");
    await expect(header).toBeVisible();
    const headerBox = (await header.boundingBox())!;
    const barBox = (await bar.boundingBox())!;
    expect(barBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height - 1);

    // Content check: code and initial status
    await expect(bar).toContainText(`เคสของคุณ ${caseCode}`);
    await expect(bar).toContainText("รอรับเคส");

    // Zero PII check: name, phone, coords absent
    const barText = await bar.innerText();
    expect(barText).not.toContain("ผู้แจ้งทดสอบ TF81");
    expect(barText).not.toContain(phone);
    expect(barText).not.toContain("14.89");
    expect(barText).not.toContain("100.4");

    // Touch target check: primary action button height >= 48px
    const viewStatusLink = bar.getByRole("link", { name: "ดูสถานะ" });
    await expect(viewStatusLink).toBeVisible();
    await expect(viewStatusLink).toHaveAttribute("href", `/track/${caseCode}?t=${trackingToken}`);
    const linkBox = (await viewStatusLink.boundingBox())!;
    expect(linkBox.height).toBeGreaterThanOrEqual(48);

    // Horizontal overflow check (375px and 360px viewport)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    if (isMobile) {
      await page.setViewportSize({ width: 360, height: 640 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.setViewportSize({ width: 375, height: 667 });
    }

    // 3) Also verify on home page (/) - HomeConfirmationLoader activates from localStorage
    await page.goto("/");
    const homeBar = page.getByTestId("my-case-bar");
    await expect(homeBar).toBeVisible();
    const homeHeaderBox = (await page.locator("header").boundingBox())!;
    const homeBarBox = (await homeBar.boundingBox())!;
    expect(homeBarBox.y).toBeGreaterThanOrEqual(homeHeaderBox.y + homeHeaderBox.height - 1);

    // 4) Advance status in DB -> ACCEPTED -> EN_ROUTE
    await stepTestCase(caseCode, ["ACCEPTED", "EN_ROUTE"]);
    await page.reload();
    await expect(homeBar).toBeVisible();
    await expect(homeBar).toContainText("ทีมกำลังมา");

    // Click "ดูสถานะ" navigates to /track/[code]?t=...
    await homeBar.getByRole("link", { name: "ดูสถานะ" }).click();
    await expect(page).toHaveURL(new RegExp(`/track/${caseCode}`));

    // Verify bar does NOT duplicate tracking strip on its own /track/[code] page
    await expect(page.getByTestId("my-case-bar")).toHaveCount(0);

    // Navigate to /hotlines -> bar reappears
    await page.goto("/hotlines");
    await expect(page.getByTestId("my-case-bar")).toBeVisible();
    await expect(page.getByTestId("my-case-bar")).toContainText("ทีมกำลังมา");

    // 5) Two-phase dismissal: dismiss in TRACKING phase
    await page.getByTestId("my-case-bar").getByRole("button", { name: "ซ่อน" }).click();
    await expect(page.getByTestId("my-case-bar")).toHaveCount(0);

    // Reload / -> stays hidden
    await page.goto("/");
    await expect(page.getByTestId("my-case-bar")).toHaveCount(0);

    // 6) Advance case to AWAITING_CONFIRMATION -> bar resurfaces automatically!
    await stepTestCase(caseCode, ["ON_SITE", "AWAITING_CONFIRMATION"]);
    await page.reload();

    const confirmBar = page.getByTestId("my-case-bar");
    await expect(confirmBar).toBeVisible();
    const confirmRegion = page.getByRole("region", { name: "ยืนยันการช่วยเหลือ" });
    await expect(confirmRegion).toBeVisible();

    // 7) Reject assistance ("ยังไม่ได้รับ") -> transitions to NEW and updates bar
    await confirmRegion.getByRole("button", { name: "ยังไม่ได้รับ" }).click();
    await expect(page.getByTestId("my-case-bar")).toBeVisible();
    await expect(page.getByTestId("my-case-bar")).toContainText("รอรับเคส");

    const updatedCase = await adminDb().from("cases").select("status").eq("case_code", caseCode).single();
    expect(updatedCase.data?.status).toBe("NEW");

    // 8) Advance to AWAITING_CONFIRMATION again and confirm ("ฉันได้รับความช่วยเหลือแล้ว")
    await stepTestCase(caseCode, ["ACCEPTED", "EN_ROUTE", "ON_SITE", "AWAITING_CONFIRMATION"]);
    await page.reload();
    await expect(page.getByRole("region", { name: "ยืนยันการช่วยเหลือ" })).toBeVisible();

    await page.getByRole("button", { name: "ฉันได้รับความช่วยเหลือแล้ว" }).click();
    await expect(page.getByTestId("my-case-bar")).toHaveCount(0);

    const resolvedCase = await adminDb().from("cases").select("status").eq("case_code", caseCode).single();
    expect(resolvedCase.data?.status).toBe("RESOLVED");
  });
});

test.describe("TF-81: Multi-Case Switcher, /en Localization, Offline Fallback & Staff Isolation", () => {
  test("multi-case switcher displays newest + อีก 1 เคส, expands, and priority override works", async ({
    page,
  }) => {
    const older = await createDbCase({ status: "NEW", landmark: "Older Case" });
    const newer = await createDbCase({ status: "EN_ROUTE", landmark: "Newer Case" });

    // Store in localStorage: older first, newer second (newest)
    await page.goto("/hotlines");
    await page.evaluate(
      ({ key, older, newer }) => {
        localStorage.setItem(
          key,
          JSON.stringify([
            {
              caseCode: older.code,
              trackingToken: older.trackingToken,
              confirmationToken: older.confirmationToken,
              lastStatus: "NEW",
            },
            {
              caseCode: newer.code,
              trackingToken: newer.trackingToken,
              confirmationToken: newer.confirmationToken,
              lastStatus: "EN_ROUTE",
            },
          ]),
        );
        window.dispatchEvent(new Event("storage"));
        window.dispatchEvent(new CustomEvent("namjaithai:device-cases"));
      },
      { key: STORAGE_KEY, older, newer },
    );

    await page.reload();
    const bar = page.getByTestId("my-case-bar");
    await expect(bar).toBeVisible();

    // Primary is newest (newer)
    await expect(bar).toContainText(newer.code);
    await expect(bar).toContainText("ทีมกำลังมา");

    // Toggle button for other cases
    const moreBtn = bar.getByRole("button", { name: "อีก 1 เคส" });
    await expect(moreBtn).toBeVisible();
    await expect(moreBtn).toHaveAttribute("aria-expanded", "false");

    // Click toggle button expands list
    await moreBtn.click();
    await expect(moreBtn).toHaveAttribute("aria-expanded", "true");
    await expect(bar).toContainText(older.code);
    await expect(bar).toContainText("รอรับเคส");

    // Dismiss primary (newer) -> older case is promoted to primary
    await bar.getByRole("button", { name: "ซ่อน", exact: true }).click();
    await expect(bar).toContainText(older.code);
    await expect(bar).toContainText("รอรับเคส");

    // Priority override: older case reaches AWAITING_CONFIRMATION beats newer in EN_ROUTE
    await stepTestCase(older.code, ["ACCEPTED", "EN_ROUTE", "ON_SITE", "AWAITING_CONFIRMATION"]);
    await page.evaluate(
      ({ key, older, newer }) => {
        // Un-dismiss newer and update older to AWAITING_CONFIRMATION
        localStorage.setItem(
          key,
          JSON.stringify([
            {
              caseCode: older.code,
              trackingToken: older.trackingToken,
              confirmationToken: older.confirmationToken,
              lastStatus: "AWAITING_CONFIRMATION",
            },
            {
              caseCode: newer.code,
              trackingToken: newer.trackingToken,
              confirmationToken: newer.confirmationToken,
              lastStatus: "EN_ROUTE",
            },
          ]),
        );
      },
      { key: STORAGE_KEY, older, newer },
    );

    await page.reload();
    await expect(page.getByRole("region", { name: "ยืนยันการช่วยเหลือ" })).toBeVisible();
    await expect(bar).toContainText(older.code);
    // Newer case is still listed under others
    await expect(bar.getByRole("button", { name: "อีก 1 เคส" })).toBeVisible();
  });

  test("English localization (/en), zero Thai leakage, and mixed-case / encoded suppression", async ({
    page,
    isMobile,
  }) => {
    const single = await createDbCase({ status: "EN_ROUTE", landmark: "EN Test" });

    await page.goto("/en/hotlines");
    await page.evaluate(
      ({ key, single }) => {
        localStorage.setItem(
          key,
          JSON.stringify([
            {
              caseCode: single.code,
              trackingToken: single.trackingToken,
              lastStatus: "EN_ROUTE",
            },
          ]),
        );
      },
      { key: STORAGE_KEY, single },
    );

    await page.reload();
    const bar = page.getByTestId("my-case-bar");
    await expect(bar).toBeVisible();

    // English copy assertions
    await expect(bar).toContainText(`Your case ${single.code}`);
    await expect(bar).toContainText("Team on the way");
    const viewStatus = bar.getByRole("link", { name: "View status" });
    await expect(viewStatus).toBeVisible();
    await expect(viewStatus).toHaveAttribute(
      "href",
      `/en/track/${single.code}?t=${single.trackingToken}`,
    );

    // Zero Thai leakage
    const text = await bar.innerText();
    expect(text).not.toContain("เคสของคุณ");
    expect(text).not.toContain("ดูสถานะ");
    expect(text).not.toContain("ทีมกำลังมา");
    expect(/[\u0E00-\u0E7F]/.test(text)).toBe(false);

    // Horizontal overflow check at 360px viewport
    if (isMobile) {
      await page.setViewportSize({ width: 360, height: 640 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.setViewportSize({ width: 375, height: 667 });
    }

    // Mixed-case / encoded route suppression on /en/track/[code]
    const lowerCode = single.code.toLowerCase();
    await page.goto(`/en/track/${lowerCode}?t=${single.trackingToken}`);
    await expect(page.getByTestId("my-case-bar")).toHaveCount(0);
  });

  test("offline resilience & error fallback renders last known status + offline hint", async ({
    page,
  }) => {
    const offlineCase = await createDbCase({ status: "ACCEPTED", landmark: "Offline Test" });

    await page.goto("/hotlines");
    await page.evaluate(
      ({ key, offlineCase }) => {
        localStorage.setItem(
          key,
          JSON.stringify([
            {
              caseCode: offlineCase.code,
              trackingToken: offlineCase.trackingToken,
              lastStatus: "ACCEPTED",
            },
          ]),
        );
      },
      { key: STORAGE_KEY, offlineCase },
    );

    // Abort all /api/track network requests
    await page.route("**/api/track/**", (route) => route.abort());
    await page.reload();

    const bar = page.getByTestId("my-case-bar");
    await expect(bar).toBeVisible();
    await expect(bar).toContainText(offlineCase.code);
    await expect(bar).toContainText("รับเคสแล้ว");
    await expect(bar).toContainText("(สถานะล่าสุด)");

    // Ensure localStorage is preserved
    const stored = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? "[]"),
      STORAGE_KEY,
    );
    expect(stored).toHaveLength(1);
    expect(stored[0].caseCode).toBe(offlineCase.code);

    // Unroute and simulate 500 error
    await page.unroute("**/api/track/**");
    await page.route("**/api/track/**", (route) =>
      route.fulfill({ status: 500, body: JSON.stringify({ error: "Internal Error" }) }),
    );
    await page.reload();

    await expect(bar).toBeVisible();
    await expect(bar).toContainText("รับเคสแล้ว");
    await expect(bar).toContainText("(สถานะล่าสุด)");
  });

  test("staff route isolation: rescuer / unit / admin routes never show case bar", async ({
    page,
    context,
  }) => {
    staffUser = await createAccount({ displayName: "TF81 Staff", role: "RESCUER" });
    const isolatedCase = await createDbCase({ status: "EN_ROUTE", landmark: "Staff Iso" });

    await page.goto("/hotlines");
    await page.evaluate(
      ({ key, isolatedCase }) => {
        localStorage.setItem(
          key,
          JSON.stringify([
            {
              caseCode: isolatedCase.code,
              trackingToken: isolatedCase.trackingToken,
              lastStatus: "EN_ROUTE",
            },
          ]),
        );
      },
      { key: STORAGE_KEY, isolatedCase },
    );

    // On /hotlines, bar is visible
    await page.reload();
    await expect(page.getByTestId("my-case-bar")).toBeVisible();

    // Sign in as rescuer and visit staff routes
    await applySession(context, staffUser);

    for (const staffRoute of ["/rescue/map", "/unit", "/admin"]) {
      await page.goto(staffRoute);
      await expect(page.getByTestId("my-case-bar")).toHaveCount(0);
    }
  });
});
