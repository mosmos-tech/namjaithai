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

test("TF-52 หัวหน้าตั้งความสามารถหน่วยและห้ามแก้ต่างหน่วย", async ({ page, context }) => {
  const db = adminDb();
  const tag = crypto.randomUUID().slice(0, 6);
  const lead = await createAccount({ displayName: `TF52 ${tag}`, role: "UNIT_LEAD" });
  const units: string[] = [];
  try {
    for (const name of [`TF52 A ${tag}`, `TF52 B ${tag}`]) {
      const { data, error } = await db
        .from("units")
        .insert({ name, province: "กรุงเทพมหานคร" })
        .select("id")
        .single();
      if (error) throw error;
      units.push(data.id);
    }
    const { error } = await db
      .from("unit_members")
      .insert({ unit_id: units[0], user_id: lead.id, role_in_unit: "LEAD", status: "APPROVED" });
    if (error) throw error;
    await applySession(context, lead);
    await page.goto("/unit");
    const panel = page.getByRole("region", { name: "ความสามารถของหน่วย" });
    await expect(panel).toBeVisible();
    await panel.getByLabel("เรือ", { exact: true }).check();
    await panel.getByLabel("การแพทย์ฉุกเฉิน").check();
    await panel.getByRole("button", { name: "บันทึกความสามารถ" }).click();
    await expect(panel.getByRole("status")).toHaveText("บันทึกความสามารถแล้ว");
    await page.reload();
    await expect(panel.getByLabel("เรือ", { exact: true })).toBeChecked();
    const forbidden = await page.request.post("/api/unit-capabilities", {
      data: { unitId: units[1], capabilities: ["EMS"] },
    });
    expect(forbidden.status()).toBe(403);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    if (units.length) await db.from("units").delete().in("id", units);
    await db.from("users").update({ status: "SUSPENDED", line_user_id: null }).eq("id", lead.id);
    await db.auth.admin.deleteUser(lead.authId);
  }
});
