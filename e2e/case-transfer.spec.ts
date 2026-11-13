import { expect, test, type Page } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { adminDb, closeTestCases } from "./helpers/db";
import { applySession, createAccount, type TestAccount } from "./helpers/accounts";

/**
 * TF-59 ส่งต่อเคสให้หน่วยอื่น
 * A ถือเคส (หน่วยต้นทาง ไม่มีเรือ) → ขอส่งต่อ เลือก "เรือ" → หน่วย B (มีเรือ ตั้งพิกัดติดกับเคส จึงอยู่บนสุด)
 * ผู้แจ้งเห็น "กำลังส่งต่อให้ทีมที่มีอุปกรณ์" ไม่เห็นชื่อหน่วย B → B กดรับในคิว "รอรับส่งต่อ" → เคสย้ายไป B
 * จังหวัดของ test นี้เอง (ไม่มีไฟล์อื่นใช้): เคส จอคอม = ชุมพร · มือถือ = นครศรีธรรมราช
 * หน่วย B อยู่ต่างจังหวัด (สุราษฎร์ธานี / พัทลุง) — เห็นเคสได้เพราะคำขอส่งต่อเท่านั้น
 */
test.describe.configure({ mode: "serial" });

const AREAS = {
  desktop: { province: "ชุมพร", target: "สุราษฎร์ธานี", point: { lat: 10.4931, lng: 99.18 } },
  mobile: { province: "นครศรีธรรมราช", target: "พัทลุง", point: { lat: 8.4325, lng: 99.9599 } },
} as const;

let area: (typeof AREAS)[keyof typeof AREAS];
let tag: string;
let holder: TestAccount;
let receiver: TestAccount;
let sourceUnitName: string;
let targetUnitName: string;
const unitIds: string[] = [];
const caseIds: string[] = [];
const users: TestAccount[] = [];

const transferBox = (page: Page) => page.getByRole("region", { name: "ส่งต่อเคส" });

function clientOf(account: TestAccount) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll: () => account.cookies, setAll: () => undefined } },
  );
}

async function newUnit(name: string, province: string, account: TestAccount, extra = {}) {
  const db = adminDb();
  const { data: unit } = await db
    .from("units")
    .insert({ name, province, ...extra })
    .select("id")
    .single()
    .throwOnError();
  unitIds.push(unit!.id);
  await db
    .from("unit_members")
    .insert({ unit_id: unit!.id, user_id: account.id, role_in_unit: "MEMBER", status: "APPROVED" })
    .throwOnError();
  return unit!.id as string;
}

/** เคสที่ A รับไว้แล้ว (สถานะ ACCEPTED) */
async function acceptedCase(code: string) {
  const { data } = await adminDb()
    .from("cases")
    .insert({
      case_code: code,
      urgency: "YELLOW",
      lat: area.point.lat,
      lng: area.point.lng,
      province: area.province,
      landmark: "จุดทดสอบ TF59",
      incident_type: "FLOOD",
    })
    .select("id, version, tracking_token")
    .single()
    .throwOnError();
  caseIds.push(data!.id);
  const { data: accepted, error } = await clientOf(holder).rpc("accept_case", {
    p_case_id: data!.id,
    p_expected_version: data!.version,
  });
  expect(error).toBeNull();
  expect(accepted.status).toBe("ACCEPTED");
  return {
    id: data!.id as string,
    version: accepted.version as number,
    token: data!.tracking_token,
  };
}

test.beforeAll(async ({}, testInfo) => {
  area = AREAS[testInfo.project.name as keyof typeof AREAS];
  tag = `TF59${testInfo.project.name[0]}${crypto.randomUUID().slice(0, 6)}`;
  holder = await createAccount({ displayName: `${tag} ผู้ถือเคส`, role: "RESCUER" });
  receiver = await createAccount({ displayName: `${tag} ผู้รับต่อ`, role: "RESCUER" });
  users.push(holder, receiver);
  sourceUnitName = `${tag} หน่วยต้นทาง`;
  targetUnitName = `${tag} หน่วยเรือ`;
  await newUnit(sourceUnitName, area.province, holder);
  const target = await newUnit(targetUnitName, area.target, receiver, {
    location: `SRID=4326;POINT(${area.point.lng} ${area.point.lat + 0.001})`,
  });
  await adminDb()
    .from("unit_capabilities")
    .insert({ unit_id: target, capability: "BOAT" })
    .throwOnError();
});

test.afterAll(async () => {
  // case_events / audit_logs แก้ลบไม่ได้ จึงปิดเคส (คำขอที่รออยู่ถูกยกเลิกอัตโนมัติ) และปิดหน่วยทิ้งไว้
  const db = adminDb();
  await closeTestCases(caseIds);
  if (unitIds.length) await db.from("units").update({ is_active: false }).in("id", unitIds);
  if (users.length) {
    await db
      .from("users")
      .update({ status: "SUSPENDED" })
      .in(
        "id",
        users.map((user) => user.id),
      );
  }
});

test("ส่งต่อ → ผู้แจ้งเห็นข้อความกลาง → หน่วยปลายทางกดรับ เคสย้ายหน่วย", async ({ browser }) => {
  // รหัสรูปแบบจริง (FL-ปปดด-ลำดับ) หน้าติดตามของผู้แจ้งจึงเปิดได้
  const code = `FL-2611-59${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
  const item = await acceptedCase(code);
  const holderContext = await browser.newContext();
  await applySession(holderContext, holder);
  const page = await holderContext.newPage();

  await page.goto(`/rescue/cases/${item.id}`);
  const open = transferBox(page).getByRole("button", { name: "ส่งต่อให้หน่วยอื่น" });
  expect((await open.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await open.click();
  const form = page.getByRole("form", { name: "ขอส่งต่อเคส" });
  await expect(form.getByText("เหตุนี้มักต้องใช้: เรือ, กู้ภัยทางน้ำ, อพยพ")).toBeVisible();
  await form.getByRole("checkbox", { name: "เรือ" }).check();
  await form.getByLabel("เหตุผลที่ส่งต่อ (บังคับ)").fill("น้ำสูงเกินเอว ต้องใช้เรือ");
  await form.getByRole("button", { name: "ค้นหาหน่วยที่มีอุปกรณ์" }).click();

  // หน่วยที่ตั้งพิกัดติดกับเคสอยู่บนสุด และเป็นระยะจริง (ไม่ใช่โดยประมาณ)
  const first = form.getByTestId("transfer-option").first();
  await expect(first).toContainText(targetUnitName);
  await expect(first).not.toContainText("โดยประมาณ");
  await expect(form.getByTestId("transfer-option").filter({ hasText: sourceUnitName })).toHaveCount(
    0,
  );
  await expect(form.getByRole("radio", { name: new RegExp(targetUnitName) })).toBeChecked();
  if (test.info().project.name === "mobile") {
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  const send = form.getByRole("button", { name: "ส่งคำขอส่งต่อ" });
  expect((await send.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await send.click();
  await expect(transferBox(page).getByRole("status")).toContainText("ส่งคำขอแล้ว");
  await expect(transferBox(page).getByTestId("outgoing-transfer")).toContainText(
    `รอหน่วย ${targetUnitName} กดรับ`,
  );
  // ระหว่างรอ หน่วยเดิมยังเป็นเจ้าของเคส
  const { data: during } = await adminDb()
    .from("cases")
    .select("assigned_rescuer_id, status")
    .eq("id", item.id)
    .single();
  expect(during).toEqual({ assigned_rescuer_id: holder.id, status: "ACCEPTED" });

  // ผู้แจ้ง: บอกว่ากำลังส่งต่อ แต่ไม่บอกชื่อหน่วยปลายทาง
  const reporter = await browser.newPage();
  await reporter.goto(`/track/${code}?t=${item.token}`);
  await expect(reporter.getByTestId("transfer-pending")).toContainText(
    "กำลังส่งต่อให้ทีมที่มีอุปกรณ์",
  );
  await expect(reporter.getByText(targetUnitName)).toHaveCount(0);

  // หน่วยปลายทาง: คิว "รอรับส่งต่อ" ในงานของฉัน
  const receiverContext = await browser.newContext({
    viewport: test.info().project.use.viewport ?? undefined,
  });
  await applySession(receiverContext, receiver);
  const receiverPage = await receiverContext.newPage();
  await receiverPage.goto("/rescue/my-tasks");
  const card = receiverPage.getByTestId("incoming-transfer-card").filter({ hasText: code });
  await expect(card).toContainText(`จากหน่วย ${sourceUnitName}`);
  await expect(card).toContainText("ต้องใช้: เรือ");
  await card.getByRole("button", { name: "รับเคสส่งต่อ" }).click();
  await expect(receiverPage.getByTestId("incoming-transfers").getByRole("status")).toHaveText(
    "รับเคสส่งต่อแล้ว",
  );
  await expect(card).toHaveCount(0);

  const { data: after } = await adminDb()
    .from("cases")
    .select("assigned_rescuer_id, assigned_unit_id, status")
    .eq("id", item.id)
    .single();
  expect(after).toEqual({
    assigned_rescuer_id: receiver.id,
    assigned_unit_id: unitIds[1],
    status: "ACCEPTED",
  });
  const { data: events } = await adminDb()
    .from("case_events")
    .select("event_type")
    .eq("case_id", item.id)
    .in("event_type", ["TRANSFER_REQUESTED", "TRANSFER_ACCEPTED", "TRANSFER_CANCELLED"])
    .order("created_at");
  expect(events).toEqual([
    { event_type: "TRANSFER_REQUESTED" },
    { event_type: "TRANSFER_ACCEPTED" },
  ]);

  // รับแล้ว: ผู้แจ้งเห็นทีมใหม่ ข้อความส่งต่อหายไป
  await reporter.reload();
  await expect(reporter.getByText(targetUnitName)).toBeVisible();
  await expect(reporter.getByTestId("transfer-pending")).toHaveCount(0);

  await holderContext.close();
  await receiverContext.close();
  await reporter.close();
});

test("หน่วยเดิมยกเลิกคำขอได้ เคสยังอยู่กับหน่วยเดิม", async ({ page, context }) => {
  const item = await acceptedCase(`${tag}-CANCEL`);
  const { data } = await clientOf(holder).rpc("request_transfer", {
    p_case_id: item.id,
    p_expected_version: item.version,
    p_to_unit_id: unitIds[1],
    p_capabilities: ["BOAT"],
    p_reason: "ทดสอบยกเลิกคำขอ",
  });
  expect(data.status).toBe("REQUESTED");

  await applySession(context, holder);
  await page.goto(`/rescue/cases/${item.id}`);
  await transferBox(page).getByRole("button", { name: "ยกเลิกคำขอส่งต่อ" }).click();
  await expect(transferBox(page).getByRole("status")).toHaveText(
    "ยกเลิกคำขอส่งต่อแล้ว เคสยังอยู่กับหน่วยของคุณ",
  );
  await expect(transferBox(page).getByRole("button", { name: "ส่งต่อให้หน่วยอื่น" })).toBeVisible();
  const { data: row } = await adminDb()
    .from("cases")
    .select("assigned_rescuer_id")
    .eq("id", item.id)
    .single();
  expect(row?.assigned_rescuer_id).toBe(holder.id);
});

test("เคสที่ส่งต่อไม่สำเร็จกลับเข้าคิวพร้อมแท็กความสามารถที่ต้องใช้", async ({ page, context }) => {
  // การหมดเวลาจริง (pg_cron 15 นาที) ทดสอบใน pgTAP — ที่นี่ตรวจว่าหน้าเว็บแสดงแท็ก
  const { data } = await adminDb()
    .from("cases")
    .insert({
      case_code: `${tag}-TAG`,
      urgency: "YELLOW",
      lat: area.point.lat,
      lng: area.point.lng,
      province: area.province,
      landmark: "จุดทดสอบ TF59",
      incident_type: "FLOOD",
      required_capabilities: ["BOAT", "EVACUATION"],
    })
    .select("id")
    .single()
    .throwOnError();
  caseIds.push(data!.id);

  await applySession(context, holder);
  await page.goto(`/rescue/cases/${data!.id}`);
  await expect(page.getByTestId("required-capabilities")).toHaveText("ต้องใช้: เรือ, อพยพ");
  await page.goto("/rescue/cases");
  await expect(
    page.locator(`[data-case-code="${tag}-TAG"]`).getByTestId("case-required-capabilities"),
  ).toHaveText("ต้องใช้: เรือ, อพยพ");
});
