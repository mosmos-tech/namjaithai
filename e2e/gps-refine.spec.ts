import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { uniqueTestPoint } from "./helpers/db";
import {
  backButton,
  expectStep,
  goToLocationStep,
  nextButton,
  openFreshSosForm,
} from "./helpers/sos";

/**
 * TF-67: ค่าแรกของ GPS มักหยาบ — ใช้ watchPosition เก็บค่าที่แม่นที่สุด
 * ได้ ≤ 100 ม. ปักหมุดทันที / ไม่งั้นรอ 15 วินาที (ใช้ page.clock แทนการรอจริง)
 */
const map = (page: Page) => page.getByTestId("step3-map-container");
const refineStatus = (page: Page) => page.getByTestId("gps-refine-status");

async function openStep2(page: Page, context: BrowserContext, accuracy: number) {
  const point = uniqueTestPoint();
  await page.clock.install();
  // นับจำนวน watch ที่เปิด/ปิด เพื่อตรวจว่าไม่มี GPS ค้างหลังออกจากขั้นนี้
  await page.addInitScript(() => {
    const geo = navigator.geolocation;
    const counts = { watch: 0, clear: 0 };
    (window as unknown as { __gpsWatch: typeof counts }).__gpsWatch = counts;
    const watch = geo.watchPosition.bind(geo);
    const clear = geo.clearWatch.bind(geo);
    geo.watchPosition = (...args) => {
      counts.watch += 1;
      return watch(...args);
    };
    geo.clearWatch = (id) => {
      counts.clear += 1;
      clear(id);
    };
  });
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: point.lat, longitude: point.lng, accuracy });
  await openFreshSosForm(page);
  await goToLocationStep(page);
  await page.getByTestId("gps-locate-button").click();
  return point;
}

const watchCounts = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __gpsWatch: { watch: number; clear: number } }).__gpsWatch,
  );

test.describe("TF-67 รอ GPS ให้แม่นขึ้น", () => {
  test("ค่าแรก 3000 ม. ตามด้วย 25 ม. → ปักหมุดให้อัตโนมัติ", async ({ page, context }) => {
    const point = await openStep2(page, context, 3000);

    await expect(refineStatus(page)).toContainText("กำลังหาตำแหน่งที่แม่นขึ้น... ±3,000 ม.");
    await expect(map(page)).not.toHaveAttribute("data-pin-lat", /.+/);

    await context.setGeolocation({ latitude: point.lat, longitude: point.lng, accuracy: 25 });
    await expect(refineStatus(page)).toHaveCount(0);
    await expect(map(page)).toHaveAttribute("data-pin-lat", String(point.lat));
    await expect(page.getByTestId("gps-status-banner")).toHaveAttribute("data-tone", "success");
    expect(await watchCounts(page)).toEqual({ watch: 1, clear: 1 });
  });

  test("ระหว่างรอกดปักหมุดเองได้ทันที ไม่ต้องรอครบ", async ({ page, context }) => {
    await openStep2(page, context, 3000);
    await expect(refineStatus(page)).toBeVisible();
    await page.getByRole("button", { name: "ปักหมุดเองบนแผนที่" }).click();
    await expect(refineStatus(page)).toHaveCount(0);
    expect(await watchCounts(page)).toEqual({ watch: 1, clear: 1 });

    await map(page).click();
    await expect(map(page)).toHaveAttribute("data-pin-lat", /\d/);
    await page.locator("#sos-landmark").fill("บ้านสีฟ้า");
    await nextButton(page).click();
    await expectStep(page, 4);
  });

  test("ครบ 15 วินาทียังไม่แม่น → ใช้ค่าดีที่สุด แล้วตัดสินด้วยเกณฑ์ 1000 ม. เดิม", async ({
    page,
    context,
  }, testInfo) => {
    const point = await openStep2(page, context, 5000);
    await expect(refineStatus(page)).toContainText("±5,000 ม.");
    await context.setGeolocation({ latitude: point.lat, longitude: point.lng, accuracy: 1800 });
    await expect(refineStatus(page)).toContainText("±1,800 ม.");

    await page.clock.fastForward(15_000);
    await expect(refineStatus(page)).toHaveCount(0);
    await expect(page.getByTestId("gps-status-banner")).toHaveAttribute("data-tone", "error");
    await expect(map(page)).toHaveAttribute("data-accuracy-radius-m", "1800");
    await expect(map(page)).not.toHaveAttribute("data-pin-lat", /.+/);

    // คำแนะนำ iPhone ขึ้นเฉพาะบน iPhone (โปรเจกต์ mobile จำลอง iPhone SE)
    const hint = page.getByTestId("ios-precise-location-hint");
    if (testInfo.project.name === "mobile") {
      await expect(hint).toHaveText(
        "ถ้าใช้ iPhone ให้เปิด ตั้งค่า > ความเป็นส่วนตัว > บริการหาตำแหน่ง > Safari > ตำแหน่งที่แม่นยำ",
      );
    } else {
      await expect(hint).toHaveCount(0);
    }
  });

  test("ออกจากขั้นนี้ระหว่างรอ → หยุด watchPosition", async ({ page, context }) => {
    await openStep2(page, context, 3000);
    await expect(refineStatus(page)).toBeVisible();
    await backButton(page).click();
    await expectStep(page, 2);
    expect(await watchCounts(page)).toEqual({ watch: 1, clear: 1 });
  });
});
