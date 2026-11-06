import type { BrowserContext } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { adminDb } from "./db";

// บัญชีทดสอบที่ล็อกอินแล้ว (สร้างผ่าน email/password ในฐานข้อมูลในเครื่อง แทนการล็อกอิน LINE)
export type TestAccount = {
  id: string;
  authId: string;
  displayName: string;
  cookies: { name: string; value: string; options?: Record<string, unknown> }[];
};

export async function createAccount(params: {
  displayName: string;
  role: "USER" | "RESCUER" | "UNIT_LEAD" | "ADMIN";
}): Promise<TestAccount> {
  const db = adminDb();
  const id = crypto.randomUUID();
  const email = `e2e-${id}@example.test`;
  const password = `${crypto.randomUUID()}!aA1`;
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
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

  const cookies: TestAccount["cookies"] = [];
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookies,
        setAll: (next) => {
          cookies.splice(0, cookies.length, ...next);
        },
      },
    },
  );
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id, authId, displayName: params.displayName, cookies };
}

export async function applySession(context: BrowserContext, account: TestAccount) {
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

export async function deleteAccount(account: TestAccount) {
  const db = adminDb();
  await db.from("users").update({ status: "SUSPENDED", line_user_id: null }).eq("id", account.id);
  await db.auth.admin.deleteUser(account.authId);
}
