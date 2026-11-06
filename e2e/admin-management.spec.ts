import { expect, test, type BrowserContext } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { adminDb } from "./helpers/db";

type TestAccount = {
  id: string;
  authId: string;
  displayName: string;
  cookies: { name: string; value: string; options?: Record<string, unknown> }[];
};

async function createAccount(params: {
  displayName: string;
  role: "USER" | "RESCUER" | "UNIT_LEAD" | "ADMIN";
}): Promise<TestAccount> {
  const db = adminDb();
  const id = crypto.randomUUID();
  const email = `tf20-${id}@example.test`;
  const password = `${crypto.randomUUID()}!aA1`;
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  const authId = data.user.id;

  const { error: userError } = await db.from("users").insert({
    id,
    auth_user_id: authId,
    display_name: params.displayName,
    line_user_id: "U" + id.replaceAll("-", ""),
    role: params.role,
    status: "ACTIVE",
  });
  if (userError) throw userError;

  const cookieStore: { name: string; value: string; options?: Record<string, unknown> }[] = [];
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore,
        setAll: (cookies) => {
          cookieStore.splice(0, cookieStore.length, ...cookies);
        },
      },
    },
  );
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  return { id, authId, displayName: params.displayName, cookies: cookieStore };
}

async function applySession(context: BrowserContext, account: TestAccount) {
  await context.clearCookies();
  await context.addCookies(
    account.cookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      url: "http://localhost:3000",
      httpOnly: cookie.options?.httpOnly === true,
      secure: cookie.options?.secure === true,
      sameSite:
        cookie.options?.sameSite === "none"
          ? ("None" as const)
          : cookie.options?.sameSite === "strict"
            ? ("Strict" as const)
            : ("Lax" as const),
    })),
  );
}

test.describe("TF-30 admin", () => {
  test("แอดมินจัดการหน่วยและสิทธิ์ โดยผู้ใช้อื่นเข้าไม่ได้", async ({
    page,
    context,
    isMobile,
  }) => {
    test.setTimeout(90_000);
    const db = adminDb();
    const tag = crypto.randomUUID().slice(0, 8);
    const admin = await createAccount({ displayName: `Admin TF30 ${tag}`, role: "ADMIN" });
    const user = await createAccount({ displayName: `User TF30 ${tag}`, role: "USER" });
    const name = `หน่วย TF30 ${tag}`;
    let unitId: string | undefined;
    const incidentCode = isMobile ? "FIRE" : "MEDICAL";
    const incidentName = isMobile ? "ไฟไหม้" : "เจ็บป่วยฉุกเฉิน";
    try {
      await applySession(context, user);
      await page.goto("/admin");
      await expect(page).toHaveURL(/\/my-cases\?denied=1/);
      expect((await page.request.get("/api/admin/manage")).status()).toBe(403);
      expect(
        (
          await page.request.post("/api/admin/manage", {
            data: { action: "user_status", userId: admin.id, status: "SUSPENDED" },
          })
        ).status(),
      ).toBe(403);
      await applySession(context, admin);
      if (isMobile) await page.setViewportSize({ width: 375, height: 812 });
      await page.goto("/admin");
      await expect(page.getByRole("heading", { name: "ห้องสั่งการ" })).toBeVisible();
      await expect(page.getByRole("button", { name: "ออกจากระบบ" })).toBeVisible();
      expect(
        (
          await page.request.post("/api/admin/manage", {
            data: { action: "user_status", userId: admin.id, status: "SUSPENDED" },
          })
        ).status(),
      ).toBe(403);
      expect(
        (
          await page.request.post("/api/admin/manage", {
            data: { action: "incident_type", code: incidentCode, enabled: true },
          })
        ).status(),
      ).toBe(400);
      await page.getByLabel("ค้นหาผู้ใช้").fill(admin.displayName);
      await page.getByRole("button", { name: "ค้นหา" }).click();
      const ownRow = page
        .getByRole("list", { name: "รายการผู้ใช้" })
        .getByRole("listitem")
        .filter({ hasText: admin.displayName });
      await expect(ownRow.getByRole("button", { name: "ระงับผู้ใช้" })).toBeDisabled();
      // รอผลค้นหาแรกจริง ๆ ก่อนเริ่มค้นหาอีกคน เพื่อไม่ให้ response เก่ามาทับผลใหม่
      const userList = page.getByRole("list", { name: "รายการผู้ใช้" });
      await expect(userList).not.toContainText(user.displayName);
      await page.getByLabel("ค้นหาผู้ใช้").fill(user.displayName);
      await page.getByRole("button", { name: "ค้นหา" }).click();
      await expect(userList).toContainText(user.displayName);
      await expect(ownRow).toHaveCount(0);
      await expect(page.getByLabel("หัวหน้าหน่วย", { exact: true })).toContainText(
        user.displayName,
      );
      await page.getByLabel("ชื่อหน่วย").fill(name);
      await page
        .getByRole("combobox", { name: "จังหวัด", exact: true })
        .selectOption({ label: "กรุงเทพมหานคร" });
      await page.getByLabel("หัวหน้าหน่วย", { exact: true }).selectOption(user.id);
      await page.getByRole("button", { name: "สร้างหน่วย", exact: true }).click();
      await expect(page.getByRole("status")).toContainText("สร้างหน่วยและแต่งตั้งหัวหน้าแล้ว");
      const unit = await db.from("units").select("id,lead_user_id").eq("name", name).single();
      expect(unit.error).toBeNull();
      unitId = unit.data!.id;
      expect(unit.data!.lead_user_id).toBe(user.id);
      const membership = await db
        .from("unit_members")
        .select("role_in_unit,status")
        .eq("unit_id", unitId)
        .eq("user_id", user.id)
        .single();
      expect(membership.data).toMatchObject({ role_in_unit: "LEAD", status: "APPROVED" });
      await page.getByLabel("เลือกหน่วย").selectOption(unitId!);
      await page.getByRole("checkbox", { name: "เรือ", exact: true }).check();
      await page.getByRole("button", { name: "บันทึกความสามารถ" }).click();
      await expect(page.getByRole("status")).toContainText("บันทึกความสามารถแล้ว");
      expect(
        (await db.from("unit_capabilities").select("capability").eq("unit_id", unitId)).data,
      ).toEqual([{ capability: "BOAT" }]);
      const incident = page
        .getByRole("region", { name: "ประเภทเหตุที่เปิดรับ" })
        .getByRole("listitem")
        .filter({ hasText: incidentName });
      await expect(incident.getByText("รอเนื้อหาผ่านการตรวจ")).toBeVisible();
      await expect(incident.getByRole("button", { name: "เปิดรับ" })).toBeDisabled();
      const row = page
        .getByRole("list", { name: "รายการผู้ใช้" })
        .getByRole("listitem")
        .filter({ hasText: user.displayName });
      await row.getByRole("button", { name: "ระงับผู้ใช้" }).click();
      await expect(page.getByRole("status")).toContainText("ระงับผู้ใช้แล้ว");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({ path: test.info().outputPath("admin.png"), fullPage: true });
      await applySession(context, user);
      await page.goto("/unit");
      await expect(page).toHaveURL(/\/login\?error=inactive/);
      expect((await page.request.get("/api/admin/manage")).status()).toBe(403);
    } finally {
      if (unitId) await db.from("units").delete().eq("id", unitId);
      for (const account of [admin, user]) {
        await db
          .from("users")
          .update({ status: "SUSPENDED", line_user_id: null })
          .eq("id", account.id);
        await db.auth.admin.deleteUser(account.authId);
      }
    }
  });
});
