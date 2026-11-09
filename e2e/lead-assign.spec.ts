import { expect, test } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { adminDb } from "./helpers/db";
import { applySession, createAccount, type TestAccount } from "./helpers/accounts";

function clientOf(account: TestAccount) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll: () => account.cookies, setAll: () => undefined } },
  );
}

test("TF-29 หัวหน้ามอบหมายและย้ายเคสให้ลูกทีม งานและประวัติเปลี่ยนตาม", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const db = adminDb();
  const tag = `TF29${testInfo.project.name[0]}${crypto.randomUUID().slice(0, 6)}`;
  const province = testInfo.project.name === "mobile" ? "ลำพูน" : "ลำปาง";
  const lead = await createAccount({ displayName: `${tag} หัวหน้า`, role: "UNIT_LEAD" });
  const member = await createAccount({ displayName: `${tag} สมาชิกหนึ่ง`, role: "RESCUER" });
  const replacement = await createAccount({ displayName: `${tag} สมาชิกสอง`, role: "RESCUER" });
  const outsider = await createAccount({ displayName: `${tag} คนนอก`, role: "RESCUER" });
  const admin = await createAccount({ displayName: `${tag} แอดมิน`, role: "ADMIN" });
  const { data: unit } = await db
    .from("units")
    .insert({ name: `${tag} หน่วย`, province })
    .select("id")
    .single()
    .throwOnError();
  const { data: otherUnit } = await db
    .from("units")
    .insert({ name: `${tag} หน่วยอื่น`, province })
    .select("id")
    .single()
    .throwOnError();
  await db
    .from("unit_members")
    .insert([
      { unit_id: unit!.id, user_id: lead.id, role_in_unit: "LEAD", status: "APPROVED" },
      { unit_id: unit!.id, user_id: member.id, role_in_unit: "MEMBER", status: "APPROVED" },
      { unit_id: unit!.id, user_id: replacement.id, role_in_unit: "MEMBER", status: "APPROVED" },
      { unit_id: otherUnit!.id, user_id: outsider.id, role_in_unit: "MEMBER", status: "APPROVED" },
    ])
    .throwOnError();
  const { data: item } = await db
    .from("cases")
    .insert({
      case_code: tag,
      urgency: "YELLOW",
      status: "NEW",
      lat: 18.5,
      lng: 99.4,
      landmark: "จุดทดสอบ TF29",
      province,
      incident_type: "FLOOD",
    })
    .select("id,version")
    .single()
    .throwOnError();
  const memberContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const replacementContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const raceCases: string[] = [];
  try {
    const illegal = await clientOf(lead).rpc("assign_case", {
      p_case_id: item!.id,
      p_unit_id: unit!.id,
      p_rescuer_id: outsider.id,
      p_expected_version: item!.version,
    });
    expect(illegal.error).not.toBeNull();
    await applySession(memberContext, member);
    await applySession(replacementContext, replacement);
    const memberPage = await memberContext.newPage();
    const replacementPage = await replacementContext.newPage();
    await memberPage.goto("/rescue/my-tasks");
    await replacementPage.goto("/rescue/my-tasks");
    await expect(memberPage.getByText("ยังไม่มีเคสที่ได้รับมอบหมาย")).toBeVisible();
    await expect(replacementPage.getByText("ยังไม่มีเคสที่ได้รับมอบหมาย")).toBeVisible();
    await applySession(page.context(), lead);
    await page.goto(`/rescue/cases/${item!.id}`);
    const form = page.getByRole("region", { name: "มอบหมายเคส" });
    const select = form.getByLabel("มอบหมายให้สมาชิกในหน่วย");
    await expect(select.getByRole("option", { name: `${tag} คนนอก` })).toHaveCount(0);
    await select.selectOption(`${unit!.id}:${member.id}`);
    await form.getByRole("button", { name: "มอบหมายเคส", exact: true }).click();
    await expect(form.getByRole("status")).toHaveText("มอบหมายเคสแล้ว");
    await expect(memberPage.getByRole("link", { name: new RegExp(tag) })).toBeVisible({
      timeout: 25_000,
    });
    await select.selectOption(`${unit!.id}:${replacement.id}`);
    await form.getByRole("button", { name: "มอบหมายเคส", exact: true }).click();
    await expect(replacementPage.getByRole("link", { name: new RegExp(tag) })).toBeVisible({
      timeout: 25_000,
    });
    await expect(memberPage.getByRole("link", { name: new RegExp(tag) })).toHaveCount(0, {
      timeout: 25_000,
    });
    const { data: events } = await db
      .from("case_events")
      .select("actor_user_id,event_type")
      .eq("case_id", item!.id)
      .eq("event_type", "ASSIGNED");
    expect(events).toHaveLength(2);
    expect(events!.every((event) => event.actor_user_id === lead.id)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const { data: membership } = await db
      .from("unit_members")
      .select("id")
      .eq("unit_id", unit!.id)
      .eq("user_id", member.id)
      .single()
      .throwOnError();
    const leaderClient = clientOf(lead);
    for (let i = 0; i < 3; i++) {
      const { data: candidate } = await db
        .from("cases")
        .insert({
          case_code: `${tag}-R${i}`,
          urgency: "YELLOW",
          status: "NEW",
          lat: 18.5,
          lng: 99.4,
          landmark: "ทดสอบพร้อมกัน",
          province,
          incident_type: "FLOOD",
        })
        .select("id,version")
        .single()
        .throwOnError();
      raceCases.push(candidate!.id);
      const [assign, suspend] = await Promise.all([
        leaderClient.rpc("assign_case", {
          p_case_id: candidate!.id,
          p_unit_id: unit!.id,
          p_rescuer_id: member.id,
          p_expected_version: candidate!.version,
        }),
        leaderClient.rpc("review_unit_members", {
          p_unit_id: unit!.id,
          p_member_ids: [membership!.id],
          p_decision: "SUSPENDED",
        }),
      ]);
      expect(suspend.error).toBeNull();
      expect(assign.error?.code).not.toBe("40P01");
      if (assign.error) expect(assign.error.code).toBe("42501");
      else expect(assign.data.status).toBe("ASSIGNED");
      await db.from("cases").update({ status: "RESOLVED" }).eq("id", candidate!.id).throwOnError();
      const restored = await leaderClient.rpc("review_unit_members", {
        p_unit_id: unit!.id,
        p_member_ids: [membership!.id],
        p_decision: "APPROVED",
      });
      expect(restored.error).toBeNull();
    }
    const { data: transferCase } = await db
      .from("cases")
      .insert({
        case_code: `${tag}-LEAD`,
        urgency: "YELLOW",
        status: "NEW",
        lat: 18.5,
        lng: 99.4,
        landmark: "ทดสอบเปลี่ยนหัวหน้า",
        province,
        incident_type: "FLOOD",
      })
      .select("id,version")
      .single()
      .throwOnError();
    raceCases.push(transferCase!.id);
    const [assignment, leadership] = await Promise.all([
      leaderClient.rpc("assign_case", {
        p_case_id: transferCase!.id,
        p_unit_id: unit!.id,
        p_rescuer_id: member.id,
        p_expected_version: transferCase!.version,
      }),
      clientOf(admin).rpc("admin_manage", {
        p_action: "assign_leader",
        p_input: { unitId: unit!.id, userId: replacement.id },
      }),
    ]);
    expect(leadership.error).toBeNull();
    expect(assignment.error?.code).not.toBe("40P01");
    if (assignment.error) expect(assignment.error.code).toBe("42501");
    else expect(assignment.data.status).toBe("ASSIGNED");
  } finally {
    await memberContext.close();
    await replacementContext.close();
    await db.from("cases").update({ status: "RESOLVED" }).eq("id", item!.id);
    if (raceCases.length) await db.from("cases").update({ status: "RESOLVED" }).in("id", raceCases);
    await db.from("units").update({ is_active: false }).in("id", [unit!.id, otherUnit!.id]);
    await db
      .from("users")
      .update({ status: "SUSPENDED" })
      .in("id", [lead.id, member.id, replacement.id, outsider.id, admin.id]);
  }
});
