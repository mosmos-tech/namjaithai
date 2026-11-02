import { test, expect, type Page } from "@playwright/test";
import { adminDb, createCaseViaApi } from "./helpers/db";
import { priorityScore } from "../src/lib/domain/priority";

async function verifyReporter(page: Page, phone: string) {
  await page.getByLabel("เบอร์โทรที่ใช้แจ้งเคส", { exact: true }).fill(phone);
  await page.getByRole("button", { name: "ยืนยันเบอร์โทร", exact: true }).click();
}

test.describe("TF-14 ผู้แจ้งอัปเดตเคส", () => {
  test("แก้ระดับน้ำ จำนวนคน โน้ต แล้วคำนวณคะแนนและบันทึกเหตุการณ์", async ({ page, baseURL }) => {
    const sent = await createCaseViaApi(baseURL!, { urgency: "YELLOW", waterLevel: "ANKLE_KNEE" });
    await page.goto(`/track/${sent.caseCode}?t=${sent.trackingToken}`);
    await page.getByRole("button", { name: "อัปเดตข้อมูลเคส" }).click();
    await verifyReporter(page, sent.phone);
    await page.getByLabel("ระดับน้ำ", { exact: true }).selectOption("ROOF");
    await page.getByLabel("ผู้ใหญ่", { exact: true }).fill("3");
    await page.getByLabel("ผู้ป่วยติดเตียง", { exact: true }).fill("2");
    await page.getByLabel("เด็กเล็ก", { exact: true }).fill("1");
    await page.getByLabel("โน้ตเพิ่มเติม").fill("น้ำขึ้นเร็ว รออยู่ชั้นสอง");
    await page.getByRole("button", { name: "บันทึกข้อมูล", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("บันทึกข้อมูลแล้ว");
    const { data: c, error } = await adminDb()
      .from("cases")
      .select("id, urgency, priority_score, created_at, water_level, notes")
      .eq("case_code", sent.caseCode)
      .single();
    expect(error).toBeNull();
    expect(c!.water_level).toBe("ROOF");
    expect(c!.notes).toBe("น้ำขึ้นเร็ว รออยู่ชั้นสอง");
    expect(c!.priority_score).toBe(
      priorityScore({
        urgency: "YELLOW",
        waterLevel: "ROOF",
        bedridden: 2,
        elderly: 0,
        children: 1,
        createdAt: new Date(c!.created_at),
      }),
    );
    const { data: people } = await adminDb()
      .from("case_people")
      .select("total_people")
      .eq("case_id", c!.id)
      .single();
    expect(people!.total_people).toBe(6);
    const { data: events } = await adminDb()
      .from("case_events")
      .select("metadata")
      .eq("case_id", c!.id)
      .eq("event_type", "REPORTER_UPDATED");
    expect(events).toHaveLength(1);
    expect(events![0].metadata.before.adults).toBe(1);
    expect(events![0].metadata.after.adults).toBe(3);
    await page.getByRole("button", { name: "อัปเดตข้อมูลเคส" }).click();
    await verifyReporter(page, sent.phone);
    await expect(page.getByLabel("ผู้ใหญ่", { exact: true })).toHaveValue("3");
    await expect(page.getByLabel("โน้ตเพิ่มเติม")).toHaveValue("น้ำขึ้นเร็ว รออยู่ชั้นสอง");
    await page.screenshot({ path: test.info().outputPath("reporter-edit.png"), fullPage: true });
    if (test.info().project.name === "mobile")
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
  });

  test("ปลอดภัยแล้วต้องยืนยัน เปลี่ยนเป็น CANCELLED และบันทึกสถานะเดิม", async ({
    page,
    baseURL,
  }) => {
    const sent = await createCaseViaApi(baseURL!);
    await page.goto(`/track/${sent.caseCode}?t=${sent.trackingToken}`);
    await page.getByRole("button", { name: "ปลอดภัยแล้ว", exact: true }).click();
    await page.getByRole("button", { name: "กลับไปติดตามเคส" }).click();
    await expect(page.getByText("รอทีมรับเคส", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "ปลอดภัยแล้ว", exact: true }).click();
    await verifyReporter(page, sent.phone);
    await page.getByRole("button", { name: "ยืนยัน ปลอดภัยแล้ว", exact: true }).click();
    await expect(page.getByRole("heading", { name: "ยกเลิกคำขอแล้ว" })).toBeVisible();
    await expect(page.getByRole("button", { name: "อัปเดตข้อมูลเคส" })).toHaveCount(0);
    const { data: c } = await adminDb()
      .from("cases")
      .select("id, status, closed_at")
      .eq("case_code", sent.caseCode)
      .single();
    expect(c!.status).toBe("CANCELLED");
    expect(c!.closed_at).toBeTruthy();
    const { data: events } = await adminDb()
      .from("case_events")
      .select("from_status, to_status")
      .eq("case_id", c!.id)
      .eq("event_type", "CANCELLED");
    expect(events).toEqual([{ from_status: "NEW", to_status: "CANCELLED" }]);
  });

  test("API ปฏิเสธ token ผิด เคสปิด และ version เก่า โดยไม่เพิ่มเหตุการณ์", async ({
    request,
    baseURL,
  }) => {
    const sent = await createCaseViaApi(baseURL!);
    const url = `/api/track/${sent.caseCode}/reporter`;
    const headers = { "X-Tracking-Token": sent.trackingToken, "X-Reporter-Phone": sent.phone };
    expect(
      (await request.get(url, { headers: { "X-Tracking-Token": sent.trackingToken } })).status(),
    ).toBe(400);
    const wrongPhone = sent.phone === "0800000000" ? "0811111111" : "0800000000";
    expect(
      (
        await request.get(url, { headers: { ...headers, "X-Reporter-Phone": wrongPhone } })
      ).status(),
    ).toBe(404);
    const details = await (await request.get(url, { headers })).json();
    expect(
      (
        await request.patch(url, {
          headers: { ...headers, "X-Tracking-Token": "0".repeat(32) },
          data: { action: "cancel", version: details.version },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await request.patch(url, {
          headers,
          data: { action: "cancel", version: details.version + 1 },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await request.patch(url, { headers, data: { action: "cancel", version: details.version } })
      ).status(),
    ).toBe(200);
    expect(
      (
        await request.patch(url, { headers, data: { action: "cancel", version: details.version } })
      ).status(),
    ).toBe(409);
    const { data: c } = await adminDb()
      .from("cases")
      .select("id")
      .eq("case_code", sent.caseCode)
      .single();
    const { count } = await adminDb()
      .from("case_events")
      .select("id", { count: "exact", head: true })
      .eq("case_id", c!.id)
      .eq("event_type", "CANCELLED");
    expect(count).toBe(1);
  });

  test("ลิงก์แชร์อย่างเดียวแก้ไม่ได้ และจำกัดการเดาเบอร์โทร", async ({
    page,
    request,
    baseURL,
  }) => {
    const sent = await createCaseViaApi(baseURL!);
    await page.goto(`/track/${sent.caseCode}?t=${sent.trackingToken}`);
    await page.getByRole("button", { name: "อัปเดตข้อมูลเคส" }).click();
    await expect(page.getByLabel("โน้ตเพิ่มเติม")).toHaveCount(0);
    const wrongPhone = sent.phone === "0800000000" ? "0811111111" : "0800000000";
    await verifyReporter(page, wrongPhone);
    await expect(page.getByRole("status")).toContainText("ข้อมูลยืนยันไม่ถูกต้อง");
    await expect(page.getByLabel("โน้ตเพิ่มเติม")).toHaveCount(0);
    const ip = `10.99.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    for (let i = 0; i < 10; i++) {
      expect(
        (
          await request.get(`/api/track/${sent.caseCode}/reporter`, {
            headers: {
              "X-Tracking-Token": sent.trackingToken,
              "X-Reporter-Phone": wrongPhone,
              "X-Forwarded-For": ip,
            },
          })
        ).status(),
      ).toBe(404);
    }
    const limited = await request.get(`/api/track/${sent.caseCode}/reporter`, {
      headers: {
        "X-Tracking-Token": sent.trackingToken,
        "X-Reporter-Phone": wrongPhone,
        "X-Forwarded-For": ip,
      },
    });
    expect(limited.status()).toBe(429);
    expect(Number(limited.headers()["retry-after"])).toBeGreaterThan(0);
  });
});
