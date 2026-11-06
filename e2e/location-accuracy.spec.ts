import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { adminDb, randomPhone, uniqueTestPoint } from "./helpers/db";
import { answerStep1, expectStep, nextButton, openFreshSosForm } from "./helpers/sos";

/**
 * TF-65: GPS จากอุปกรณ์ที่ไม่มี GPS จริง (เช่น MacBook ได้ ±16 กม.) ต้องไม่ถูกปักหมุดให้เหมือนถูก
 * - ไปขั้นถัดไปไม่ได้จนกว่าจะปักหมุดเอง
 * - หรือกด "ปักหมุดไม่ได้ ส่งพร้อมที่อยู่แทน" แล้วกรอกที่อยู่ — ไม่บล็อก SOS ทั้งหมด
 */
const INACCURATE_MESSAGE =
  "ตำแหน่งจากอุปกรณ์นี้ไม่แม่น กรุณาแตะบนแผนที่ วางลิงก์ Google Maps หรือกรอกที่อยู่";
const INACCURATE_ACCURACY_M = 16000;

async function openStep2WithGps(page: Page, context: BrowserContext, accuracy: number) {
  const point = uniqueTestPoint();
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: point.lat, longitude: point.lng, accuracy });
  await openFreshSosForm(page);
  await answerStep1(page);
  await nextButton(page).click();
  await expectStep(page, 2);
  await page.getByTestId("gps-locate-button").click();
  return point;
}

const map = (page: Page) => page.getByTestId("step2-map-container");

test.describe("TF-65 ความแม่นยำของตำแหน่ง (ขั้นที่ 2)", () => {
  test("GPS ±16 กม.: ไม่ปักหมุดให้ วงกว้างเท่าค่าจริง และไปต่อไม่ได้จนกว่าจะปักเอง", async ({
    page,
    context,
  }) => {
    await openStep2WithGps(page, context, INACCURATE_ACCURACY_M);

    await expect(page.getByTestId("gps-status-banner")).toContainText(INACCURATE_MESSAGE);
    await expect(map(page)).toHaveAttribute(
      "data-accuracy-radius-m",
      String(INACCURATE_ACCURACY_M),
    );
    await expect(map(page)).not.toHaveAttribute("data-pin-lat", /.+/);

    await page.locator("#sos-landmark").fill("บ้านสีฟ้า ตรงข้ามวัด");
    await nextButton(page).click();
    await expectStep(page, 2);
    await expect(page.getByTestId("step2-missing-alert")).toContainText("พิกัดตำแหน่ง");

    // แตะกลางแผนที่ = ปักหมุดเอง แล้วไปต่อได้
    await map(page).click();
    await expect(map(page)).toHaveAttribute("data-pin-lat", /\d/);
    await expect(map(page)).not.toHaveAttribute("data-accuracy-radius-m", /.+/);
    await nextButton(page).click();
    await expectStep(page, 3);
  });

  test("GPS แม่น (±30 ม.): ปักหมุดให้และวงมีรัศมีเท่าค่าจริง", async ({ page, context }) => {
    const point = await openStep2WithGps(page, context, 30);
    await expect(map(page)).toHaveAttribute("data-pin-lat", String(point.lat));
    await expect(map(page)).toHaveAttribute("data-accuracy-radius-m", "30");
  });

  test("ปักหมุดไม่ได้ ส่งพร้อมที่อยู่แทน: ต้องกรอกที่อยู่ แล้วส่งได้ เก็บ GPS + accuracy เดิม", async ({
    page,
    context,
  }) => {
    await openStep2WithGps(page, context, INACCURATE_ACCURACY_M);
    await page.getByRole("button", { name: "ปักหมุดไม่ได้ ส่งพร้อมที่อยู่แทน" }).click();
    await expect(page.getByTestId("address-fallback-notice")).toBeVisible();

    await page.locator("#sos-landmark").fill("บ้านสีฟ้า ตรงข้ามวัด");
    await nextButton(page).click();
    await expectStep(page, 2);
    await expect(page.getByTestId("step2-missing-alert")).toContainText("ที่อยู่");

    await page.locator("#sos-address-line").fill("99/1 หมู่ 3 ซอยวัดไร่ขิง");
    await nextButton(page).click();
    await expectStep(page, 3);
    await nextButton(page).click();
    await expectStep(page, 4);
    await nextButton(page).click();
    await expectStep(page, 5);

    const phone = randomPhone();
    await page.getByPlaceholder("เช่น สมชาย ใจดี (หรือชื่อเล่น)").fill("ทดสอบ TF-65");
    await page.getByPlaceholder("เช่น 0812345678 หรือ 081-234-5678").fill(phone);
    await page.getByRole("button", { name: "แจ้งขอความช่วยเหลือทันที" }).click();
    await expect(page.getByText(/รหัสเคสของคุณคือ FL-\d{4}-\d{4,}/)).toBeVisible({
      timeout: 15_000,
    });

    const { data, error } = await adminDb()
      .from("case_contacts")
      .select("detailed_address, cases(location_source, accuracy_m)")
      .eq("phone", phone)
      .single();
    expect(error).toBeNull();
    expect(data).toMatchObject({
      detailed_address: "99/1 หมู่ 3 ซอยวัดไร่ขิง",
      cases: { location_source: "GPS", accuracy_m: INACCURATE_ACCURACY_M },
    });
  });

  test("API: GPS เกิน 1000 ม. ไม่มีที่อยู่ ตอบ 400 และไม่สร้างเคส", async ({ request }) => {
    const phone = randomPhone();
    const response = await request.post("/api/cases", {
      headers: { "Idempotency-Key": crypto.randomUUID() },
      data: {
        dangerSigns: [],
        canSelfEvacuate: false,
        ...uniqueTestPoint(),
        accuracyM: INACCURATE_ACCURACY_M,
        locationSource: "GPS",
        landmark: "หน้าวัด",
        adults: 1,
        elderly: 0,
        bedridden: 0,
        children: 0,
        pets: 0,
        needs: [],
        name: "ทดสอบ TF-65",
        phone,
      },
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).fields).toContain("addressLine");
    const { count } = await adminDb()
      .from("case_contacts")
      .select("id", { count: "exact", head: true })
      .eq("phone", phone);
    expect(count).toBe(0);
  });
});
