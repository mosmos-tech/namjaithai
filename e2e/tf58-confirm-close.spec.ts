import { expect, test } from "@playwright/test";
import { adminDb, closeTestCases, randomPhone, uniqueTestPoint } from "./helpers/db";
import { applySession, createAccount, type TestAccount } from "./helpers/accounts";
test.describe.configure({ mode: "serial" });
test.setTimeout(60_000);
let lead: TestAccount;
let unitId: string;
let createdCaseId: string | undefined;
let cases: { id: string; case_code: string; tracking_token: string; confirmation_token: string }[];
test.beforeAll(async () => {
  const db = adminDb();
  const tag = crypto.randomUUID().slice(0, 6);
  lead = await createAccount({ displayName: `TF58 ${tag}`, role: "UNIT_LEAD" });
  const unit = await db
    .from("units")
    .insert({ name: `TF58 ${tag}`, province: "ภูเก็ต" })
    .select("id")
    .single()
    .throwOnError();
  unitId = unit.data!.id;
  await db
    .from("unit_members")
    .insert({ unit_id: unitId, user_id: lead.id, role_in_unit: "LEAD", status: "APPROVED" })
    .throwOnError();
  const base = Math.floor(Math.random() * 8_000_000) + 1_000_000;
  const result = await db
    .from("cases")
    .insert(
      [0, 1, 2].map((i) => ({
        case_code: `FL-2611-${base + i}`,
        urgency: "YELLOW",
        status: "AWAITING_CONFIRMATION",
        lat: 7.9 + i / 10000,
        lng: 98.4,
        landmark: "TF58 test",
        province: "ภูเก็ต",
        incident_type: "FLOOD",
        assigned_unit_id: unitId,
        last_status_updated_at:
          i === 2 ? new Date(Date.now() - 25 * 3600_000).toISOString() : new Date().toISOString(),
      })),
    )
    .select("id,case_code,tracking_token")
    .throwOnError();
  await db
    .from("case_contacts")
    .insert({ case_id: result.data![1].id, phone_last4: "5678", phone: "0812345678" })
    .throwOnError();
  cases = await Promise.all(
    result.data!.map(async (item) => {
      const secret = await db.rpc("confirmation_secret_for_case", { p_case_code: item.case_code });
      if (secret.error || !secret.data) throw new Error("missing confirmation token");
      return { ...item, confirmation_token: secret.data as string };
    }),
  );
});
test.afterAll(async () => {
  if (cases?.length)
    await closeTestCases([
      ...cases.map((item) => item.id),
      ...(createdCaseId ? [createdCaseId] : []),
    ]);
  if (unitId) await adminDb().from("units").update({ is_active: false }).eq("id", unitId);
  if (lead) await adminDb().from("users").update({ status: "SUSPENDED" }).eq("id", lead.id);
});
test("เปิดเว็บจากเครื่องเดิมแล้วปฏิเสธ เคสกลับ NEW และหัวหน้าเห็นแจ้งเตือน", async ({
  page,
  context,
}, info) => {
  if (info.project.name === "mobile") await page.setViewportSize({ width: 375, height: 812 });
  const item = cases[0];
  await page.addInitScript(
    (ref) => localStorage.setItem("namjaithai:confirmation-cases", JSON.stringify([ref])),
    {
      caseCode: item.case_code,
      trackingToken: item.tracking_token,
      confirmationToken: item.confirmation_token,
    },
  );
  await page.goto("/");
  const banner = page.getByRole("region", { name: "ยืนยันการช่วยเหลือ" });
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "ยังไม่ได้รับ" }).click();
  await expect(banner).toHaveCount(0);
  const { data } = await adminDb()
    .from("cases")
    .select("status")
    .eq("id", item.id)
    .single()
    .throwOnError();
  expect(data!.status).toBe("NEW");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.close();
  await applySession(context, lead);
  const response = await context.request.get("/api/unit/confirmation-queue");
  expect(response.ok()).toBeTruthy();
  expect((await response.json()).items).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: item.id, kind: "NOT_RECEIVED" })]),
  );
});
test("โทเค็นติดตามยืนยันไม่ได้ แต่เครื่องผู้แจ้งยืนยันได้ และเคสเกิน 24 ชั่วโมงเข้าคิวหัวหน้า", async ({
  page,
  context,
}) => {
  const item = cases[1];
  await page.goto(`/track/${item.case_code}?t=${item.tracking_token}`);
  const actions = page.getByRole("region", { name: "ยืนยันการช่วยเหลือ" });
  await expect(page.getByText("ทีมแจ้งว่าช่วยเหลือเสร็จแล้ว").first()).toBeVisible();
  await expect(actions).toHaveCount(0);
  const lookup = await context.request.post("/api/track", {
    data: { caseCode: item.case_code, phoneLast4: "5678" },
  });
  expect(lookup.ok()).toBeTruthy();
  const tracking = await lookup.json();
  expect(tracking.confirmationToken).toBeUndefined();
  const denied = await context.request.post(`/api/track/${item.case_code}/confirmation`, {
    headers: { "X-Confirmation-Token": tracking.trackingToken },
    data: { decision: "CONFIRM" },
  });
  expect(denied.status()).toBe(404);
  await page.evaluate(
    (ref) => localStorage.setItem("namjaithai:confirmation-cases", JSON.stringify([ref])),
    {
      caseCode: item.case_code,
      trackingToken: item.tracking_token,
      confirmationToken: item.confirmation_token,
    },
  );
  await page.reload();
  await expect(actions).toBeVisible();
  await actions.getByRole("button", { name: "ฉันได้รับความช่วยเหลือแล้ว" }).click();
  await expect(actions).toHaveCount(0);
  const { data } = await adminDb()
    .from("cases")
    .select("status,close_confirmation")
    .eq("id", item.id)
    .single()
    .throwOnError();
  expect(data).toMatchObject({ status: "RESOLVED", close_confirmation: "REPORTER_CONFIRMED" });
  await applySession(context, lead);
  await page.goto("/unit");
  const row = page.getByRole("listitem").filter({ hasText: cases[2].case_code });
  await expect(row).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: "ปิดโดยไม่ได้รับการยืนยัน" }).click();
  await expect(row).toHaveCount(0);
  const result = await adminDb()
    .from("cases")
    .select("status,close_confirmation")
    .eq("id", cases[2].id)
    .single()
    .throwOnError();
  expect(result.data).toMatchObject({ status: "RESOLVED", close_confirmation: "LEAD_UNCONFIRMED" });
});

test("ส่ง SOS ได้โทเค็นยืนยันแยก และส่งซ้ำด้วย idempotency key เดิมได้ค่าเดิม", async ({
  request,
}) => {
  const phone = randomPhone();
  const key = crypto.randomUUID();
  const payload = {
    consent: true,
    healthConsent: true,
    dangerSigns: [],
    canSelfEvacuate: false,
    ...uniqueTestPoint(),
    landmark: "TF58 SOS",
    adults: 1,
    elderly: 0,
    bedridden: 0,
    children: 0,
    pets: 0,
    needs: [],
    name: "TF58",
    duplicateAction: "CREATE_NEW",
    phone,
  };
  const send = () =>
    request.post("/api/cases", { headers: { "Idempotency-Key": key }, data: payload });
  const first = await send();
  expect(first.ok()).toBeTruthy();
  const body = await first.json();
  // TF-74: API ไม่ส่ง id ภายในของเคสกลับไป หา id จากรหัสเคสไว้ปิดเคสตอนจบ
  const { data: created } = await adminDb()
    .from("cases")
    .select("id")
    .eq("case_code", body.caseCode)
    .single()
    .throwOnError();
  createdCaseId = created!.id;
  expect(body.confirmationToken).toMatch(/^[0-9a-f]{32}$/);
  expect(body.confirmationToken).not.toBe(body.trackingToken);
  const replay = await send();
  expect(replay.ok()).toBeTruthy();
  expect((await replay.json()).confirmationToken).toBe(body.confirmationToken);
});
