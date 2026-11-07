import { expect, test } from "@playwright/test";
import { adminDb, createCaseViaApi } from "./helpers/db";
import { applySession, createAccount, deleteAccount } from "./helpers/accounts";

/**
 * TF-34 แจ้งเตือน LINE — การส่ง SOS ไม่รอ LINE (เขียนลงคิวแล้วจบ) และชุดทดสอบไม่ยิง LINE API จริง
 */
test.describe("TF-34 แจ้งเตือน LINE", () => {
  test("ส่ง SOS ที่เป็นเคสแดงสำเร็จทันที และเข้าคิวแจ้งเคสแดงให้ worker", async ({ baseURL }) => {
    const sent = await createCaseViaApi(baseURL!, { dangerSigns: ["UNCONSCIOUS"] });
    const db = adminDb();
    const { data: item } = await db
      .from("cases")
      .select("id, urgency, line_red_case_queue(case_id, processed_at)")
      .eq("case_code", sent.caseCode)
      .single();
    expect(item?.urgency).toBe("RED");
    expect(item?.line_red_case_queue).toMatchObject({ case_id: item?.id });
  });

  test("ผู้ใช้ทั่วไปเรียก worker เองไม่ได้", async ({ request }) => {
    expect((await request.post("/api/notifications/line")).status()).toBe(401);
    expect(
      (
        await request.post("/api/notifications/line", {
          headers: { Authorization: "Bearer wrong-secret-wrong-secret" },
        })
      ).status(),
    ).toBe(401);
  });

  test("โควตา LINE เดือนนี้หมด: แอดมินเห็นแถบแจ้งบนห้องสั่งการ", async ({ page, context }) => {
    const db = adminDb();
    const admin = await createAccount({ displayName: "แอดมิน TF34", role: "ADMIN" });
    const until = new Date(Date.now() + 7 * 24 * 3600_000).toISOString();
    try {
      await db
        .from("line_delivery_state")
        .update({ paused_until: until, reason: "line_monthly_quota" })
        .eq("id", true)
        .throwOnError();
      await applySession(context, admin);
      await page.goto("/admin");
      await expect(page.getByTestId("line-delivery-paused")).toContainText(
        "โควตาข้อความ LINE เดือนนี้หมด",
      );
    } finally {
      await db
        .from("line_delivery_state")
        .update({ paused_until: null, reason: null })
        .eq("id", true);
      await deleteAccount(admin);
    }
  });

  test("หัวหน้าหน่วยที่ยังไม่ตั้งความสามารถเห็นแถบเตือนบนหน้า /unit พร้อมลิงก์ไปตั้งค่า", async ({
    page,
    context,
  }) => {
    const db = adminDb();
    const lead = await createAccount({ displayName: "หัวหน้า TF34", role: "UNIT_LEAD" });
    const { data: unit } = await db
      .from("units")
      .insert({ name: `หน่วย TF34 ${crypto.randomUUID().slice(0, 4)}`, province: "ตราด" })
      .select("id")
      .single()
      .throwOnError();
    try {
      await db
        .from("unit_members")
        .insert({ unit_id: unit!.id, user_id: lead.id, role_in_unit: "LEAD", status: "APPROVED" })
        .throwOnError();
      await applySession(context, lead);
      await page.goto("/unit");
      const notice = page.getByTestId("unit-capability-missing");
      await expect(notice).toContainText("หน่วยยังไม่ได้ตั้งความสามารถ จะได้รับแจ้งเตือนทุกประเภท");
      await expect(notice.getByRole("link", { name: "ตั้งความสามารถหน่วย" })).toHaveAttribute(
        "href",
        "#capability-heading",
      );

      await db
        .from("unit_capabilities")
        .insert({ unit_id: unit!.id, capability: "BOAT" })
        .throwOnError();
      await page.reload();
      await expect(page.getByTestId("unit-capability-missing")).toHaveCount(0);
    } finally {
      await db.from("units").delete().eq("id", unit!.id);
      await deleteAccount(lead);
    }
  });
});
