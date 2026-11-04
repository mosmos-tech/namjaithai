import { expect, test } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { adminDb } from "./helpers/db";

test.describe("TF-19 ลิงก์สมัครกู้ภัย", () => {
  let inviteToken: string;
  let unitId: string;
  let creatorId: string;
  let authUserId: string;
  let authCookies: { name: string; value: string; options?: Record<string, unknown> }[] = [];
  let email: string;
  let password: string;

  test.beforeAll(async () => {
    const admin = adminDb();
    creatorId = crypto.randomUUID();
    email = `tf19-${creatorId}@example.test`;
    password = `${crypto.randomUUID()}!aA1`;
    inviteToken = `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
    const { data: authUser, error: authError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (authError) throw authError;
    authUserId = authUser.user.id;
    const { error: userError } = await admin.from("users").insert({
      id: creatorId,
      auth_user_id: authUserId,
      display_name: "TF-19 E2E",
      role: "UNIT_LEAD",
      status: "ACTIVE",
    });
    if (userError) throw userError;
    const { data: unit, error: unitError } = await admin
      .from("units")
      .insert({ name: `หน่วย E2E ${creatorId.slice(0, 8)}`, province: "กรุงเทพมหานคร" })
      .select("id")
      .single();
    if (unitError) throw unitError;
    unitId = unit.id;
    const { error: memberError } = await admin.from("unit_members").insert({
      user_id: creatorId,
      unit_id: unitId,
      role_in_unit: "LEAD",
      status: "APPROVED",
    });
    if (memberError) throw memberError;
    const { error: inviteError } = await admin.from("invites").insert({
      unit_id: unitId,
      token: inviteToken,
      created_by: creatorId,
      max_uses: 1,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    });
    if (inviteError) throw inviteError;

    const cookieStore: { name: string; value: string; options?: Record<string, unknown> }[] = [];
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { cookies: {
        getAll: () => cookieStore,
        setAll: (cookies) => { cookieStore.splice(0, cookieStore.length, ...cookies); },
      } },
    );
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
    authCookies = cookieStore;
  });

  test.afterAll(async () => {
    if (!creatorId) return;
    const admin = adminDb();
    if (unitId) await admin.from("units").delete().eq("id", unitId);
    await admin.from("users").delete().eq("id", creatorId);
    if (authUserId) await admin.auth.admin.deleteUser(authUserId);
  });

  test("ลิงก์ใช้ได้พาไปยืนยันตัวตนด้วย LINE อัตโนมัติ", async ({ request }) => {
    const entry = await request.get(`/join/${inviteToken}`, { maxRedirects: 0 });
    expect(entry.status()).toBe(307);
    expect(entry.headers().location).toBe(new URL(`/auth/line?invite=${inviteToken}`, "http://localhost:3000").href);

    const oauth = await request.get(entry.headers().location, { maxRedirects: 0 });
    expect(oauth.status()).toBe(307);
    expect(oauth.headers().location).toContain("/auth/v1/authorize");
  });

  test("ลิงก์ที่ไม่มีอยู่ใช้สมัครไม่ได้ และบอกให้ขอลิงก์ใหม่", async ({ page }) => {
    await page.goto(`/join/${"0".repeat(64)}`);
    await expect(page).toHaveURL(/\/login\?error=invite$/);
    await expect(page.locator("p[role='alert']")).toContainText("ลิงก์สมัครนี้หมดอายุ");
  });

  test("ผู้ใช้ที่ยังไม่ล็อกอินสร้างหรือดู invite ไม่ได้", async ({ request }) => {
    const [readResponse, createResponse] = await Promise.all([
      request.get("/api/unit-invites"),
      request.post("/api/unit-invites", {
        data: { unitId: "c1900000-0000-0000-0000-000000000001", maxUses: 1, expiresAt: new Date(Date.now() + 86400000).toISOString() },
      }),
    ]);
    expect(readResponse.status()).toBe(403);
    expect(createResponse.status()).toBe(403);
  });

  test("หัวหน้าสร้างและยกเลิกลิงก์ได้ที่หน้าจอ 375px", async ({ page, context }) => {
    expect(authCookies.length).toBeGreaterThan(0);
    await context.addCookies(authCookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      url: "http://localhost:3000",
      httpOnly: cookie.options?.httpOnly === true,
      secure: cookie.options?.secure === true,
      sameSite: cookie.options?.sameSite === "none" ? "None" : cookie.options?.sameSite === "strict" ? "Strict" : "Lax",
    })));
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await page.getByRole("button", { name: "เปิดเมนู" }).click();
    const account = page.getByRole("link", { name: "หน้าของฉัน" });
    await expect(account).toHaveAttribute("href", "/unit");
    await account.click();
    await expect(page.getByRole("heading", { name: "ลิงก์เชิญกู้ภัยผ่าน LINE" })).toBeVisible();
    await page.getByLabel("จำนวนผู้สมัครสูงสุด").fill("2");
    const expiry = new Date(Date.now() + 2 * 86400000);
    expiry.setMinutes(expiry.getMinutes() - expiry.getTimezoneOffset());
    await page.getByLabel("หมดอายุวันที่และเวลา").fill(expiry.toISOString().slice(0, 16));
    await page.getByRole("button", { name: "สร้างลิงก์สมัคร" }).click();
    await expect(page.getByRole("status")).toContainText("สร้างลิงก์แล้ว");
    const createdInvite = page.getByRole("listitem").filter({ hasText: "0/2" }).first();
    await expect(createdInvite.getByText(/\/join\/[a-f0-9]{64}/)).toBeVisible();
    await createdInvite.getByRole("button", { name: "ยกเลิก" }).click();
    await expect(page.getByRole("status")).toContainText("ยกเลิกลิงก์แล้ว");
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  });

  test("ข้อความลิงก์ใช้ไม่ได้ไม่ล้นจอมือถือ 375px", async ({ page, isMobile }) => {
    test.skip(!isMobile, "ตรวจขนาดมือถือเท่านั้น");
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`/join/${"0".repeat(64)}`);
    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(hasHorizontalOverflow).toBe(false);
  });
});
