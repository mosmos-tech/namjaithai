import { expect, test, type Page } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { adminDb } from "./helpers/db";
import { applySession, createAccount, type TestAccount } from "./helpers/accounts";

/**
 * TF-25 รับเคสและปล่อยเคส
 * - กดพร้อมกันจริง 2 session (คนละ connection ฐานข้อมูล) ต้องได้คนเดียวทุกรอบ
 * - หน้ารายละเอียดเคสที่จอ 375px: รับ → เห็นปุ่มดูเบอร์ / คนกดช้าเห็นชื่อหน่วย / ปล่อยพร้อมเหตุผล
 * ใช้จังหวัดระนองที่ test อื่นไม่ใช้ เคสของ test อื่นจะได้ไม่ปนกัน
 */
test.describe.configure({ mode: "serial" });

const PROVINCE = "ระนอง";
let tag: string;
let first: TestAccount;
let second: TestAccount;
let admin: TestAccount;
const unitIds: string[] = [];
const caseIds: string[] = [];

// กล่องรับ/ปล่อยเคส (หน้าเว็บมี role=alert อื่นอยู่ด้วย เช่น ตัวประกาศเปลี่ยนหน้าของ Next.js)
const claim = (page: Page) => page.getByRole("region", { name: "รับหรือปล่อยเคส" });

// Supabase client ที่ล็อกอินเป็นบัญชีนั้น (เรียก RPC ผ่าน RLS เหมือนหน้าเว็บ)
function clientOf(account: TestAccount) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll: () => account.cookies, setAll: () => undefined } },
  );
}

async function newCase(code: string) {
  const { data } = await adminDb()
    .from("cases")
    .insert({
      case_code: code,
      urgency: "YELLOW",
      lat: 9.96,
      lng: 98.64,
      province: PROVINCE,
      landmark: "จุดทดสอบ TF25",
      incident_type: "FLOOD",
    })
    .select("id, version")
    .single()
    .throwOnError();
  caseIds.push(data!.id);
  return data as { id: string; version: number };
}

test.beforeAll(async ({}, testInfo) => {
  const db = adminDb();
  tag = `TF25${testInfo.project.name[0]}${crypto.randomUUID().slice(0, 6)}`;
  first = await createAccount({ displayName: `${tag} คนแรก`, role: "RESCUER" });
  second = await createAccount({ displayName: `${tag} คนที่สอง`, role: "RESCUER" });
  admin = await createAccount({ displayName: `${tag} แอดมิน`, role: "ADMIN" });
  for (const [account, name] of [
    [first, `${tag} หน่วยหนึ่ง`],
    [second, `${tag} หน่วยสอง`],
  ] as const) {
    const { data: unit } = await db
      .from("units")
      .insert({ name, province: PROVINCE })
      .select("id")
      .single()
      .throwOnError();
    unitIds.push(unit!.id);
    await db
      .from("unit_members")
      .insert({
        unit_id: unit!.id,
        user_id: account.id,
        role_in_unit: "MEMBER",
        status: "APPROVED",
      })
      .throwOnError();
  }
});

test.afterAll(async () => {
  // case_events / audit_logs แก้ลบไม่ได้ จึงปิดเคสและหน่วยทิ้งไว้ในฐานข้อมูลทดสอบ
  const db = adminDb();
  if (caseIds.length) await db.from("cases").update({ status: "RESOLVED" }).in("id", caseIds);
  if (unitIds.length) await db.from("units").update({ is_active: false }).in("id", unitIds);
  const users = [first, second, admin].filter(Boolean).map((user) => user.id);
  if (users.length) await db.from("users").update({ status: "SUSPENDED" }).in("id", users);
});

test("2 คนกดรับพร้อมกัน ได้คนเดียวทุกรอบ อีกคนได้ชื่อหน่วยที่รับไป", async () => {
  const clients = [clientOf(first), clientOf(second)];
  for (let round = 0; round < 10; round++) {
    const item = await newCase(`${tag}-RACE-${round}`);
    const results = await Promise.all(
      clients.map((client) =>
        client.rpc("accept_case", { p_case_id: item.id, p_expected_version: item.version }),
      ),
    );
    for (const result of results) expect(result.error).toBeNull();
    const statuses = results.map((result) => result.data.status).sort();
    expect(statuses, `รอบที่ ${round + 1}`).toEqual(["ACCEPTED", "TAKEN"]);

    const winner = results.findIndex((result) => result.data.status === "ACCEPTED");
    const loser = results[1 - winner].data;
    expect(Object.keys(loser).sort()).toEqual(["status", "unitName"]);
    expect(loser.unitName).toBe(`${tag} ${winner === 0 ? "หน่วยหนึ่ง" : "หน่วยสอง"}`);

    const { data: row } = await adminDb()
      .from("cases")
      .select("assigned_rescuer_id")
      .eq("id", item.id)
      .single();
    expect(row?.assigned_rescuer_id).toBe([first, second][winner].id);
    // ปิดเคสของรอบนี้ ไม่ให้ใครชนเพดาน 2 เคสในรอบถัดไป
    await adminDb().from("cases").update({ status: "RESOLVED" }).eq("id", item.id);
  }
});

test("จอ 375px: รับเคสแล้วเห็นปุ่มดูเบอร์ คนกดช้าเห็นชื่อหน่วย แล้วปล่อยเคสพร้อมเหตุผล", async ({
  browser,
}) => {
  const item = await newCase(`${tag}-UI`);
  await adminDb()
    .from("case_contacts")
    .insert({ case_id: item.id, name: "ผู้แจ้ง TF25", phone: "0892500025", phone_last4: "0025" })
    .throwOnError();

  const viewport = { width: 375, height: 812 };
  const firstContext = await browser.newContext({ viewport });
  const secondContext = await browser.newContext({ viewport });
  await applySession(firstContext, first);
  await applySession(secondContext, second);
  const firstPage = await firstContext.newPage();
  const secondPage = await secondContext.newPage();

  // คนที่สองเปิดหน้าไว้ก่อน (เห็นปุ่มรับ) แล้วคนแรกกดรับก่อน
  await secondPage.goto(`/rescue/cases/${item.id}`);
  await expect(secondPage.getByRole("button", { name: "รับเคสนี้" })).toBeVisible();
  await firstPage.goto(`/rescue/cases/${item.id}`);
  const accept = firstPage.getByRole("button", { name: "รับเคสนี้" });
  expect((await accept.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await expect(firstPage.getByRole("button", { name: "แสดงเบอร์โทร" })).toHaveCount(0);
  await accept.click();
  await expect(claim(firstPage).getByRole("status")).toHaveText("รับเคสแล้ว");
  await expect(firstPage.getByText("สถานะ: รับเคสแล้ว")).toBeVisible();

  // สิทธิ์ใหม่ใช้ได้ทันที: เปิดเบอร์ผู้แจ้งได้
  await firstPage.getByRole("button", { name: "แสดงเบอร์โทร" }).click();
  await expect(firstPage.getByRole("link", { name: "โทร 0892500025" })).toBeVisible();

  await secondPage.getByRole("button", { name: "รับเคสนี้" }).click();
  await expect(claim(secondPage).getByRole("alert")).toHaveText(
    `หน่วย ${tag} หน่วยหนึ่ง รับเคสนี้ไปแล้ว`,
  );
  await expect(secondPage.getByRole("button", { name: "รับเคสนี้" })).toHaveCount(0);
  await expect(secondPage.getByText(first.displayName)).toHaveCount(0);

  // ปล่อยเคส: ต้องมีเหตุผล
  await firstPage.getByRole("button", { name: "ปล่อยเคส" }).click();
  await firstPage.getByLabel("เหตุผลที่ปล่อยเคส (บังคับ)").fill("เรือเสีย ไปไม่ถึง");
  await firstPage.getByRole("button", { name: "ยืนยันปล่อยเคส" }).click();
  await expect(claim(firstPage).getByRole("status")).toHaveText(
    "ปล่อยเคสแล้ว ระบบกำลังหาทีมใหม่ให้ผู้แจ้ง",
  );
  await expect(firstPage.getByRole("button", { name: "รับเคสนี้" })).toBeVisible();
  await expect(firstPage.getByRole("button", { name: "แสดงเบอร์โทร" })).toHaveCount(0);

  const { data: row } = await adminDb()
    .from("cases")
    .select("status, assigned_rescuer_id, assigned_unit_id")
    .eq("id", item.id)
    .single();
  expect(row).toEqual({ status: "NEW", assigned_rescuer_id: null, assigned_unit_id: null });
  const { data: events } = await adminDb()
    .from("case_events")
    .select("event_type, note")
    .eq("case_id", item.id)
    .order("created_at");
  expect(events).toEqual([
    { event_type: "ACCEPTED", note: null },
    { event_type: "RELEASED", note: "เรือเสีย ไปไม่ถึง" },
  ]);

  await firstContext.close();
  await secondContext.close();
});

test("แอดมินไม่มีปุ่มรับเคส", async ({ page, context }) => {
  const item = await newCase(`${tag}-ADMIN`);
  await applySession(context, admin);
  await page.goto(`/rescue/cases/${item.id}`);
  await expect(page.getByText(`${tag}-ADMIN`)).toBeVisible();
  await expect(page.getByRole("button", { name: "รับเคสนี้" })).toHaveCount(0);
});
