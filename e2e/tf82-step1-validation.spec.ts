import { expect, test } from "@playwright/test";
import { waitForSosFormReady } from "./helpers/sos";

for (const locale of ["th", "en"] as const) {
  test(`${locale}: an explicit incident link works with an unfinished blank draft`, async ({ page }) => {
    await page.route(/\/rest\/v1\/incident_types/, (route) => route.fulfill({ json: [{ code: "FIRE" }] }));
    await page.addInitScript(() => localStorage.setItem("namjaithai-sos-draft-v2", JSON.stringify({ currentStep: 1, name: "Saved name", updatedAt: new Date().toISOString() })));
    await page.goto(locale === "th" ? "/request?type=FIRE" : "/en/request?type=FIRE");
    await waitForSosFormReady(page);
    await expect(page.getByTestId("incident-type-FIRE")).toHaveAttribute("aria-checked", "true");
  });

  test(`${locale}: a fresh form cannot advance without selecting an incident`, async ({
    page,
    isMobile,
  }) => {
    await page.goto(locale === "th" ? "/request" : "/en/request");
    await waitForSosFormReady(page);
    await page
      .getByRole("button", { name: locale === "th" ? /^ถัดไป/ : /^Next/ })
      .filter({ visible: true })
      .click();
    await expect(page.getByTestId("incident-type-grid")).toBeVisible();
    await expect(
      page.getByText(locale === "th" ? /กรุณาเลือกประเภทเหตุ/ : /choose.*incident/i).first(),
    ).toBeVisible();
    if (!isMobile) {
      await page
        .getByRole("button", { name: locale === "th" ? /^\s*2\s*รายละเอียด/ : /^\s*2\s*Details/ })
        .click();
      await expect(page.getByTestId("incident-type-grid")).toBeVisible();
    }
    await expect(page.locator('a[href="tel:1669"]').first()).toBeVisible();
  });

  test(`${locale}: a disabled saved incident is cleared while other draft data remains`, async ({
    page,
  }) => {
    await page.route(/\/rest\/v1\/incident_types/, (route) =>
      route.fulfill({ json: [{ code: "FLOOD" }] }),
    );
    await page.addInitScript(() => {
      localStorage.setItem(
        "namjaithai-sos-draft-v2",
        JSON.stringify({
          currentStep: 2,
          incidentType: "FIRE",
          details: { fireLocation: "HOUSE" },
          dangerSigns: ["UNCONSCIOUS", "TRAPPED_IN_FIRE"],
          name: "Saved name",
          updatedAt: new Date().toISOString(),
        }),
      );
    });
    await page.goto(locale === "th" ? "/request?type=FIRE" : "/en/request?type=FIRE");
    await waitForSosFormReady(page);
    await expect(page.getByTestId("incident-type-grid")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => JSON.parse(localStorage.getItem("namjaithai-sos-draft-v2")!).incidentType,
        ),
      )
      .toBeUndefined();
    const draft = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("namjaithai-sos-draft-v2")!),
    );
    expect(draft.details).toEqual({});
    expect(draft.dangerSigns).toEqual(["UNCONSCIOUS"]);
    await expect(page.getByTestId("danger-call-bar").locator('a[href="tel:1669"]')).toBeVisible();
    expect(draft.name).toBe("Saved name");
    await expect(
      page.getByText(locale === "th" ? "กรอกต่อจากที่ค้างไว้" : "Continue your saved draft"),
    ).toBeVisible();
    await page.getByRole("button", { name: locale === "th" ? "เริ่มใหม่" : "Start over" }).click();
    await expect(
      page.getByText(locale === "th" ? "กรอกต่อจากที่ค้างไว้" : "Continue your saved draft"),
    ).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("namjaithai-sos-draft-v2"))).toBeNull();
  });

  test(`${locale}: a successfully sent draft is not restored on reopening`, async ({ page }) => {
    await page.route("**/api/cases", (route) =>
      route.fulfill({
        status: 201,
        json: { caseCode: "FL-2611-1234", trackingToken: "test-token" },
      }),
    );
    await page.addInitScript(() => {
      if (sessionStorage.getItem("tf82-seeded")) return;
      sessionStorage.setItem("tf82-seeded", "yes");
      localStorage.setItem(
        "namjaithai-sos-draft-v2",
        JSON.stringify({
          currentStep: 5,
          incidentType: "FLOOD",
          atScene: true,
          dangerSigns: [],
          canSelfEvacuate: true,
          waterLevel: "ANKLE_KNEE",
          details: {},
          adults: 1,
          lat: 13.7563,
          lng: 100.5018,
          landmark: "Test location",
          needs: [],
          name: "Test name",
          phone: "0812345678",
          updatedAt: new Date().toISOString(),
        }),
      );
    });
    await page.goto(locale === "th" ? "/request" : "/en/request");
    await waitForSosFormReady(page);
    await page
      .getByRole("checkbox", {
        name:
          locale === "th" ? /^ยินยอมให้ใช้ข้อมูลเพื่อ/ : /^I consent to the use of my information/,
      })
      .check();
    await page
      .getByRole("checkbox", {
        name:
          locale === "th"
            ? /^ยินยอมให้ใช้ข้อมูลสุขภาพ/
            : /^I consent to the use of health information/,
      })
      .check();
    await page.getByTestId("step5-submit-button").filter({ visible: true }).click();
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("namjaithai-sos-draft-v2")))
      .toBeNull();
    await page.goto(locale === "th" ? "/request" : "/en/request");
    await waitForSosFormReady(page);
    await expect(page.getByTestId("incident-type-grid")).toBeVisible();
    await expect(
      page.getByTestId("incident-type-grid").getByRole("radio", { checked: true }),
    ).toHaveCount(0);
  });
}
