import { expect, test, type BrowserContext } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { adminDb, createCaseViaApi, stepTestCase } from "./helpers/db";

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

test.describe("TF-20 คิวอนุมัติและระงับสมาชิก", () => {
  test.setTimeout(60_000);

  let unitId: string;
  let lead: TestAccount;
  let applicant1: TestAccount;
  let applicant2: TestAccount;
  let applicant3: TestAccount;
  let m1Id: string;
  let m2Id: string;
  let m3Id: string;

  test.beforeEach(async () => {
    const db = adminDb();
    const tag = crypto.randomUUID().slice(0, 6);

    lead = await createAccount({ displayName: `หัวหน้าหน่วย ${tag}`, role: "UNIT_LEAD" });
    applicant1 = await createAccount({ displayName: `กู้ภัยหนึ่ง ${tag}`, role: "RESCUER" });
    applicant2 = await createAccount({ displayName: `กู้ภัยสอง ${tag}`, role: "RESCUER" });
    applicant3 = await createAccount({ displayName: `กู้ภัยสาม ${tag}`, role: "RESCUER" });

    const { data: unit, error: unitError } = await db
      .from("units")
      .insert({ name: `หน่วยทดสอบ TF-20 ${tag}`, province: "กรุงเทพมหานคร" })
      .select("id")
      .single();
    if (unitError) throw unitError;
    unitId = unit.id;

    const { error: leadMemberError } = await db.from("unit_members").insert({
      unit_id: unitId,
      user_id: lead.id,
      role_in_unit: "LEAD",
      status: "APPROVED",
    });
    if (leadMemberError) throw leadMemberError;

    const { data: insertedMembers, error: membersError } = await db
      .from("unit_members")
      .insert([
        { unit_id: unitId, user_id: applicant1.id, role_in_unit: "MEMBER", status: "PENDING" },
        { unit_id: unitId, user_id: applicant2.id, role_in_unit: "MEMBER", status: "PENDING" },
        { unit_id: unitId, user_id: applicant3.id, role_in_unit: "MEMBER", status: "PENDING" },
      ])
      .select("id, user_id");
    if (membersError || !insertedMembers) throw membersError;

    m1Id = insertedMembers.find((m) => m.user_id === applicant1.id)!.id;
    m2Id = insertedMembers.find((m) => m.user_id === applicant2.id)!.id;
    m3Id = insertedMembers.find((m) => m.user_id === applicant3.id)!.id;
  });

  test.afterEach(async () => {
    const db = adminDb();
    if (unitId) {
      await db.from("units").delete().eq("id", unitId);
    }
    for (const acc of [lead, applicant1, applicant2, applicant3]) {
      if (!acc) continue;
      // audit_logs เป็น append-only จึงระงับโปรไฟล์และลบบัญชี auth แทนการลบแถว users
      await db.from("users").update({ status: "SUSPENDED", line_user_id: null }).eq("id", acc.id);
      await db.auth.admin.deleteUser(acc.authId);
    }
  });

  test("TF-21 แสดงสถานะและเคสเฉพาะหน่วย", async ({ page, context, baseURL, isMobile }) => {
    const db = adminDb();
    const { error: memberError } = await db
      .from("unit_members")
      .update({ status: "APPROVED", is_on_duty: true, duty_status: "EN_ROUTE" })
      .eq("id", m1Id);
    expect(memberError).toBeNull();
    const { data: otherUnit, error: otherError } = await db
      .from("units")
      .insert({ name: `หน่วยอื่น ${crypto.randomUUID()}`, province: "กรุงเทพมหานคร" })
      .select("id, name")
      .single();
    expect(otherError).toBeNull();
    const own = await createCaseViaApi(baseURL!);
    const other = await createCaseViaApi(baseURL!);
    try {
      for (const [code, assignedUnit] of [
        [own.caseCode, unitId],
        [other.caseCode, otherUnit!.id],
      ]) {
        // TF-26: เลื่อนทีละขั้น (ข้ามขั้น NEW → EN_ROUTE ไม่ได้)
        await stepTestCase(code, ["ACCEPTED", "EN_ROUTE"], {
          assigned_unit_id: assignedUnit,
          assigned_rescuer_id: applicant1.id,
        });
      }
      await applySession(context, lead);
      if (isMobile) await page.setViewportSize({ width: 375, height: 812 });
      await page.goto("/unit");
      const row = page
        .getByRole("list", { name: "รายการสมาชิกในหน่วย" })
        .getByRole("listitem")
        .filter({ hasText: applicant1.displayName });
      await expect(row).toContainText("กำลังเดินทาง");
      await expect(row).toContainText(own.caseCode);
      await expect(page.getByText(other.caseCode)).toHaveCount(0);
      await expect(page.getByText(otherUnit!.name)).toHaveCount(0);
      await page.screenshot({ path: test.info().outputPath("unit-mobile.png"), fullPage: true });
      const response = await page.request.get("/api/unit-members");
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(JSON.stringify(body)).not.toContain(other.caseCode);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    } finally {
      await db
        .from("cases")
        .update({ assigned_unit_id: null, assigned_rescuer_id: null })
        .in("case_code", [own.caseCode, other.caseCode]);
      await db.from("units").delete().eq("id", otherUnit!.id);
    }
  });
  test("อนุมัติหลายคนพร้อมกัน ปฏิเสธ และระงับสมาชิกบนจอ 375px พร้อมตรวจสิทธิ์ /rescue, อายุ 90 วัน, audit_logs และคิว LINE", async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    const db = adminDb();
    await page.setViewportSize({ width: 375, height: 812 });

    // 1. ก่อนอนุมัติ: ผู้สมัครที่ยังเป็น PENDING เข้า /rescue ไม่ได้
    await applySession(context, applicant1);
    await page.goto("/rescue");
    await expect(page).toHaveURL(/\/my-cases\?denied=1$/);

    // 2. หัวหน้าหน่วยเปิดหน้า /unit บนจอมือถือ 375px เห็นผู้สมัครครบ 3 คน และไม่ล้นจอ
    await applySession(context, lead);
    await page.goto("/unit");
    await expect(page.getByRole("heading", { name: "คิวอนุมัติและระงับสมาชิก" })).toBeVisible();
    const pendingList = page.getByRole("list", { name: "รายการผู้สมัครรออนุมัติ" });
    await expect(pendingList.getByText(applicant1.displayName)).toBeVisible();
    await expect(pendingList.getByText(applicant2.displayName)).toBeVisible();
    await expect(pendingList.getByText(applicant3.displayName)).toBeVisible();

    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasOverflow).toBe(false);

    // 3. เลือก 2 คนแรกเพื่อกดอนุมัติพร้อมกัน (หลายคน)
    await page.getByRole("checkbox", { name: `เลือก ${applicant1.displayName}` }).check();
    await page.getByRole("checkbox", { name: `เลือก ${applicant2.displayName}` }).check();
    await page.getByRole("button", { name: "อนุมัติที่เลือก (2)" }).click();
    await expect(page.getByRole("status")).toContainText(
      "อนุมัติสมาชิก 2 คนแล้ว (สิทธิ์ใช้งาน 90 วัน)",
    );

    // 4. ปฏิเสธคนที่ 3 แบบรายคน
    const row3 = pendingList.getByRole("listitem").filter({ hasText: applicant3.displayName });
    await row3.getByRole("button", { name: "ปฏิเสธ" }).click();
    await expect(page.getByRole("status")).toContainText("ปฏิเสธคำขอ 1 คนแล้ว");

    // 5. ตรวจวันหมดอายุ 90 วันในฐานข้อมูลของคนที่ได้รับอนุมัติ
    const { data: m1Row } = await db
      .from("unit_members")
      .select("status, approved_by, expires_at")
      .eq("id", m1Id)
      .single();
    expect(m1Row?.status).toBe("APPROVED");
    expect(m1Row?.approved_by).toBe(lead.id);
    const ttlDays = (Date.parse(m1Row!.expires_at!) - Date.now()) / (24 * 60 * 60 * 1000);
    expect(ttlDays).toBeGreaterThan(89.9);
    expect(ttlDays).toBeLessThanOrEqual(90.1);

    // 6. อนุมัติแล้วกู้ภัยคนที่ 1 เข้า /rescue ได้ทันที
    await applySession(context, applicant1);
    await page.goto("/rescue");
    await expect(page).toHaveURL(/\/rescue$/);
    await expect(page.getByRole("heading", { name: "แผนที่กู้ภัย", level: 1 })).toBeVisible();

    // 7. คนที่ 3 ที่ถูกปฏิเสธ เข้า /rescue ไม่ได้ (หลุดสิทธิ์ทันที)
    await applySession(context, applicant3);
    await page.goto("/rescue");
    await expect(page).toHaveURL(/\/my-cases\?denied=1$/);

    // 8. หัวหน้าหน่วยกดระงับสมาชิกคนที่ 1 -> หลุดสิทธิ์เข้า /rescue ทันที
    await applySession(context, lead);
    await page.goto("/unit");
    const memberList = page.getByRole("list", { name: "รายการสมาชิกในหน่วย" });
    const approvedRow1 = memberList
      .getByRole("listitem")
      .filter({ hasText: applicant1.displayName });
    await expect(approvedRow1).toContainText("อายุสิทธิ์ 90 วัน");
    await approvedRow1.getByRole("button", { name: "ระงับสมาชิก" }).click();
    await expect(page.getByRole("status")).toContainText("ระงับสมาชิก 1 คนแล้ว");

    await applySession(context, applicant1);
    await page.goto("/rescue");
    await expect(page).toHaveURL(/\/my-cases\?denied=1$/);

    // 9. สิทธิ์หมดอายุเมื่อครบ 90 วัน -> คนที่ 2 หลุดสิทธิ์เข้า /rescue ทันที
    await db
      .from("unit_members")
      .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", m2Id);

    await applySession(context, applicant2);
    await page.goto("/rescue");
    await expect(page).toHaveURL(/\/my-cases\?denied=1$/);

    // 10. ตรวจสอบว่าทุกการอนุมัติ/ปฏิเสธ/ระงับ มีบันทึกใน audit_logs และสร้างคิวแจ้งผลทาง LINE
    const { data: logs } = await db
      .from("audit_logs")
      .select("action, actor_user_id, target_id, target_user_id")
      .in("target_id", [m1Id, m2Id, m3Id])
      .order("created_at", { ascending: true });

    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "MEMBER_APPROVED",
          actor_user_id: lead.id,
          target_id: m1Id,
          target_user_id: applicant1.id,
        }),
        expect.objectContaining({
          action: "MEMBER_APPROVED",
          actor_user_id: lead.id,
          target_id: m2Id,
          target_user_id: applicant2.id,
        }),
        expect.objectContaining({
          action: "MEMBER_REJECTED",
          actor_user_id: lead.id,
          target_id: m3Id,
          target_user_id: applicant3.id,
        }),
        expect.objectContaining({
          action: "MEMBER_SUSPENDED",
          actor_user_id: lead.id,
          target_id: m1Id,
          target_user_id: applicant1.id,
        }),
      ]),
    );

    const { data: lineQueue } = await db
      .from("member_line_notifications")
      .select("unit_member_id, to_status")
      .eq("unit_id", unitId);
    expect(lineQueue).toHaveLength(4);
  });
});
