import { test, expect, type APIRequestContext, type BrowserContext } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { adminDb, randomPhone, randomBangkokPoint } from "./helpers/db";

async function account() {
  const db = adminDb();
  const id = crypto.randomUUID();
  const email = `tf43-${id}@example.test`;
  const password = `${crypto.randomUUID()}!aA1`;
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const authId = data.user.id;
  const { error: insertError } = await db.from("users").insert({
    id,
    auth_user_id: authId,
    display_name: "TF43 synthetic reporter",
    line_user_id: "U" + id.replaceAll("-", ""),
    role: "USER",
    status: "ACTIVE",
  });
  if (insertError) throw insertError;
  const store: { name: string; value: string; options?: Record<string, unknown> }[] = [];
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => store,
        setAll: (cookies) => {
          store.splice(0, store.length, ...cookies);
        },
      },
    },
  );
  const { error: loginError } = await client.auth.signInWithPassword({ email, password });
  if (loginError) throw loginError;
  return { id, authId, cookies: store };
}
async function login(context: BrowserContext, user: Awaited<ReturnType<typeof account>>) {
  await context.clearCookies();
  await context.addCookies(
    user.cookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: "localhost",
      path: "/",
      sameSite: "Lax" as const,
    })),
  );
}
async function report(request: APIRequestContext, extra: Record<string, unknown> = {}) {
  const phone = randomPhone();
  const response = await request.post("/api/cases", {
    headers: {
      "Idempotency-Key": crypto.randomUUID(),
      "X-Forwarded-For": `10.43.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
    },
    data: {
      consent: true,
      healthConsent: true,
      // TF-55: ส่งคำตอบ ระบบคำนวณระดับเอง (ไม่รับ urgency จากผู้แจ้งแล้ว)
      dangerSigns: [],
      canSelfEvacuate: false,
      ...randomBangkokPoint(),
      landmark: "TF43 synthetic fixture",
      adults: 1,
      elderly: 0,
      children: 0,
      bedridden: 0,
      pets: 0,
      needs: [],
      duplicateAction: "CREATE_NEW",
      name: "TF43 synthetic",
      phone,
      ...extra,
    },
  });
  expect(response.status()).toBe(201);
  return { ...(await response.json()), phone } as {
    caseCode: string;
    trackingToken: string;
    phone: string;
  };
}

test.describe("TF-43 account cases", () => {
  test.setTimeout(60_000);
  let owner: Awaited<ReturnType<typeof account>>;
  let other: Awaited<ReturnType<typeof account>>;
  test.beforeEach(async ({ context }) => {
    owner = await account();
    other = await account();
    await login(context, owner);
  });
  test.afterEach(async () => {
    for (const user of [owner, other]) {
      if (!user) continue;
      // Audit events are append-only and retain actor IDs. Retire synthetic
      // profiles instead of deleting referenced users, and disable queued pushes.
      const { error } = await adminDb()
        .from("users")
        .update({ status: "SUSPENDED", line_user_id: null })
        .eq("id", user.id);
      if (error) throw error;
      const { error: authError } = await adminDb().auth.admin.deleteUser(user.authId);
      if (authError) throw authError;
    }
  });

  test("บัญชีใหม่มีหน้าว่างพร้อมค้นหาเคสที่แจ้งก่อนล็อกอิน", async ({ page }) => {
    await page.goto("/my-cases");
    await expect(
      page.getByRole("heading", { name: "ยังไม่มีเคสที่แจ้งด้วยบัญชีนี้" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "ค้นหาด้วยรหัสเคส" })).toHaveAttribute(
      "href",
      "/track",
    );
    await expect(
      page.getByText("การแจ้งเตือนสถานะทาง LINE ยังไม่เปิดใช้งาน", { exact: false }),
    ).toBeVisible();
  });

  test("ส่ง SOS ผูกเจ้าของจาก session และกดเคสแล้วติดตามได้ทันที", async ({ page }) => {
    const sent = await report(page.request, {
      reporterUserId: other.id,
      reporter_user_id: other.id,
    });
    const { data: row } = await adminDb()
      .from("cases")
      .select("reporter_user_id")
      .eq("case_code", sent.caseCode)
      .single();
    expect(row!.reporter_user_id).toBe(owner.id);
    await page.goto("/my-cases");
    const card = page.getByRole("link").filter({ hasText: sent.caseCode });
    await expect(card).toBeVisible();
    await card.click();
    await expect(page).toHaveURL(new RegExp(`/track/${sent.caseCode}\\?t=${sent.trackingToken}$`));
    await expect(
      page.getByRole("heading", { name: "กำลังหาทีมกู้ภัยที่ใกล้คุณที่สุด", exact: true }),
    ).toBeVisible();
    if (test.info().project.name === "mobile")
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
  });

  test("ไม่แสดงเคสของบัญชีอื่น แม้แก้ query string", async ({ page, context }) => {
    const own = await report(page.request);
    await login(context, other);
    const theirs = await report(page.request);
    await login(context, owner);
    await page.goto(`/my-cases?user_id=${other.id}`);
    await expect(page.getByRole("link").filter({ hasText: own.caseCode })).toBeVisible();
    await expect(page.getByText(theirs.caseCode, { exact: true })).toHaveCount(0);
    expect(await page.content()).not.toContain(theirs.trackingToken);
  });

  test("แบ่งหน้าเคสเก่า และหน้ารายการไม่ล้นจอ 375px", async ({ page }) => {
    const base = String(BigInt("0x" + owner.id.replaceAll("-", "").slice(0, 12)));
    const fixtures = Array.from({ length: 21 }, (_, i) => ({
      case_code: `FL-2611-${base}${String(i).padStart(2, "0")}`,
      urgency: "GREEN",
      ...randomBangkokPoint(),
      landmark: "TF43 pagination synthetic",
      reporter_user_id: owner.id,
      created_at: new Date(Date.now() - (i + 1) * 60000).toISOString(),
      province: "กรุงเทพมหานคร",
    }));
    const { error } = await adminDb().from("cases").insert(fixtures);
    expect(error).toBeNull();
    await page.goto("/my-cases");
    await expect(
      page.getByRole("list", { name: "รายการเคสของฉัน" }).getByRole("listitem"),
    ).toHaveCount(20);
    await expect(page.getByRole("link").filter({ hasText: fixtures[0].case_code })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("my-cases.png"), fullPage: false });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole("link", { name: "หน้าถัดไป" }).click();
    await expect(page.getByRole("link").filter({ hasText: fixtures[20].case_code })).toBeVisible();
    await expect(
      page.getByRole("list", { name: "รายการเคสของฉัน" }).getByRole("listitem"),
    ).toHaveCount(1);
  });

  test("พักคิว LINE เมื่อเปลี่ยนสถานะ และผู้ใช้เรียก worker เองไม่ได้", async ({ page }) => {
    const sent = await report(page.request);
    const { data: row } = await adminDb()
      .from("cases")
      .select("id")
      .eq("case_code", sent.caseCode)
      .single();
    const { error: updateError } = await adminDb()
      .from("cases")
      .update({ status: "ACCEPTED" })
      .eq("id", row!.id);
    expect(updateError).toBeNull();
    const { data: jobs, error: queueError } = await adminDb()
      .from("case_line_notifications")
      .select("user_id,to_status,state")
      .eq("case_id", row!.id);
    expect(queueError).toBeNull();
    expect(jobs).toEqual([]);
    expect((await page.request.post("/api/notifications/line")).status()).toBe(401);
  });

  test("guest ยังติดตามด้วยรหัสและ 4 ตัวท้ายได้ และปลอมเจ้าของไม่ได้", async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    const sent = await report(page.request, { reporterUserId: owner.id });
    const { data: row } = await adminDb()
      .from("cases")
      .select("reporter_user_id")
      .eq("case_code", sent.caseCode)
      .single();
    expect(row!.reporter_user_id).toBeNull();
    await page.goto("/track");
    await page.getByRole("textbox", { name: "รหัสเคส" }).fill(sent.caseCode);
    await page.getByRole("textbox", { name: "เบอร์โทร 4 ตัวท้าย" }).fill(sent.phone.slice(-4));
    await page.getByRole("button", { name: "ดูสถานะเคส" }).click();
    await expect(page.getByText("รอทีมรับเคส", { exact: true })).toBeVisible();
  });
});
