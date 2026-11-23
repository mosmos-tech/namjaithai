import { expect, test } from "@playwright/test";

const cases = [
  { type: "FLOOD", need: "EVACUATION_BOAT" },
  { type: "FIRE", need: "FIRE_RESCUE" },
  { type: "ROAD_ACCIDENT", need: "VEHICLE_EXTRICATION" },
  { type: "MEDICAL", need: "AMBULANCE" },
  { type: "WATER_RESCUE", need: "WATER_RESCUE" },
  { type: "COLLAPSE", need: "DEBRIS_RESCUE" },
  { type: "ANIMAL", need: "ANIMAL_RESPONSE" },
  { type: "OTHER", need: "OTHER" },
];

for (const locale of ["th", "en"] as const) {
  test(`${locale}: a restored legacy need can be deselected and reselected`, async ({ page }) => {
    await page.route(/\/rest\/v1\/incident_types/, (route) =>
      route.fulfill({ json: cases.map(({ type }) => ({ code: type })) }),
    );
    await page.goto(locale === "th" ? "/request" : "/en/request");
    await page.evaluate(() => localStorage.setItem("namjaithai-sos-draft-v2", JSON.stringify({
      incidentType: "ROAD_ACCIDENT", currentStep: 4, atScene: true,
      needs: ["EVACUATE_BEDRIDDEN"], updatedAt: new Date().toISOString(),
      dangerSigns: [], canSelfEvacuate: true, adults: 1,
      details: { vehicleTypes: ["CAR"], isTrapped: false, injuredCount: 1 },
      lat: 13.7563, lng: 100.5018, landmark: "Test landmark",
    })));
    await page.reload();
    const legacy = page.getByTestId("need-option-EVACUATE_BEDRIDDEN");
    await expect(legacy).toHaveAttribute("aria-pressed", "true");
    await legacy.click();
    await expect(legacy).toHaveAttribute("aria-pressed", "false");
    await page.getByRole("button", { name: locale === "th" ? /ย้อนกลับ/ : /Back/ }).filter({ visible: true }).last().click();
    await page.getByRole("button", { name: locale === "th" ? /^ถัดไป/ : /^Next/ }).filter({ visible: true }).click();
    await expect(legacy).toHaveAttribute("aria-pressed", "false");
    await legacy.click();
    await expect(legacy).toHaveAttribute("aria-pressed", "true");
  });

  test(`${locale}: step 4 displays appropriate needs for each incident`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.route(/\/rest\/v1\/incident_types/, (route) =>
      route.fulfill({ json: cases.map(({ type }) => ({ code: type })) }),
    );
    await page.goto(locale === "th" ? "/request" : "/en/request");
    for (const { type, need } of cases) {
      await page.evaluate((incidentType) => {
        localStorage.setItem("namjaithai-sos-draft-v2", JSON.stringify({
          incidentType, currentStep: 4, atScene: true, updatedAt: new Date().toISOString(),
        }));
      }, type);
      await page.reload();
      await expect(page.getByTestId("step4-needs-grid")).toBeVisible();
      await expect(page.getByTestId(`need-option-${need}`)).toBeVisible();
      await expect(page.getByTestId("need-option-OTHER")).toBeVisible();
      if (type !== "FLOOD") await expect(page.getByTestId("need-option-EVACUATION_BOAT")).toHaveCount(0);
      if (type === "ROAD_ACCIDENT") {
        await expect(page.getByTestId("need-option-EVACUATE_BEDRIDDEN")).toHaveCount(0);
        await expect(page.getByTestId("need-option-AMBULANCE")).toContainText(locale === "th" ? "รถพยาบาล" : "Ambulance");
      }
    }
  });
}
