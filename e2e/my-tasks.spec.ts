import { expect, test } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { adminDb, closeTestCases } from "./helpers/db";
import { applySession, createAccount, type TestAccount } from "./helpers/accounts";

/**
 * TF-26 อัปเดตสถานะและงานของฉัน
 * - หน้า /rescue/my-tasks ที่จอ 375px: ปุ่มสถานะถัดไปปุ่มเดียว (≥56px) ทีละขั้นจนถึง "ช่วยเสร็จแล้ว"
 * - กู้ภัยคนอื่นเห็นสถานะเปลี่ยนในหน้ารายการเอง (ช่องทาง Realtime ของ TF-27 / ดึงสำรอง 15 วิ)
 * - กดพร้อมกันจริง 2 session ได้คนเดียว (version) · ปิดเคสผ่าน RPC ไม่ได้
 * แยกจังหวัดตามโปรเจกต์ เคสของ test อื่นจะได้ไม่ปนกัน
 */
test.describe.configure({ mode: "serial" });

const AREA: Record<string, { province: string; lat: number; lng: number }> = {
  desktop: { province: "สตูล", lat: 6.62, lng: 100.07 },
  mobile: { province: "ยะลา", lat: 6.54, lng: 101.28 },
};
let area: (typeof AREA)[string];
let tag: string;
let rescuer: TestAccount;
let lead: TestAccount;
let other: TestAccount;
const unitIds: string[] = [];
const caseIds: string[] = [];

function clientOf(account: TestAccount) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll: () => account.cookies, setAll: () => undefined } },
  );
}

async function acceptedCase(code: string) {
  const { data } = await adminDb()
    .from("cases")
    .insert({
      case_code: code,
      urgency: "YELLOW",
      lat: area.lat,
      lng: area.lng,
      province: area.province,
      landmark: `${tag} หน้าวัด`,
      incident_type: "FLOOD",
    })
    .select("id, version")
    .single()
    .throwOnError();
  caseIds.push(data!.id);
  const { data: accepted, error } = await clientOf(rescuer).rpc("accept_case", {
    p_case_id: data!.id,
    p_expected_version: data!.version,
  });
  expect(error).toBeNull();
  expect(accepted.status).toBe("ACCEPTED");
  return { id: data!.id as string, version: accepted.version as number };
}

test.beforeAll(async ({}, testInfo) => {
  const db = adminDb();
  area = AREA[testInfo.project.name] ?? AREA.desktop;
  tag = `TF26${testInfo.project.name[0]}${crypto.randomUUID().slice(0, 6)}`;
  rescuer = await createAccount({ displayName: `${tag} กู้ภัย`, role: "RESCUER" });
  lead = await createAccount({ displayName: `${tag} หัวหน้า`, role: "UNIT_LEAD" });
  other = await createAccount({ displayName: `${tag} หน่วยอื่น`, role: "RESCUER" });
  for (const [members, name] of [
    [
      [
        [rescuer, "MEMBER"],
        [lead, "LEAD"],
      ],
      `${tag} หน่วยหนึ่ง`,
    ],
    [[[other, "MEMBER"]], `${tag} หน่วยสอง`],
  ] as const) {
    const { data: unit } = await db
      .from("units")
      .insert({ name, province: area.province })
      .select("id")
      .single()
      .throwOnError();
    unitIds.push(unit!.id);
    for (const [account, role] of members) {
      await db
        .from("unit_members")
        .insert({ unit_id: unit!.id, user_id: account.id, role_in_unit: role, status: "APPROVED" })
        .throwOnError();
    }
  }
});

test.afterAll(async () => {
  const db = adminDb();
  await closeTestCases(caseIds);
  if (unitIds.length) await db.from("units").update({ is_active: false }).in("id", unitIds);
  const users = [rescuer, lead, other].filter(Boolean).map((user) => user.id);
  if (users.length) await db.from("users").update({ status: "SUSPENDED" }).in("id", users);
});

test("จอ 375px: ปุ่มเดียวทีละขั้นจนช่วยเสร็จแล้ว และกู้ภัยคนอื่นเห็นสถานะเปลี่ยนเอง", async ({
  browser,
}) => {
  // รอ Realtime / ดึงสำรอง 3 ครั้ง ครั้งละไม่เกิน 35 วิ
  test.setTimeout(150_000);
  const item = await acceptedCase(`${tag}-UI`);
  await adminDb()
    .from("case_contacts")
    .insert({ case_id: item.id, name: "ผู้แจ้ง TF26", phone: "0892600026", phone_last4: "0026" })
    .throwOnError();

  const viewport = { width: 375, height: 812 };
  const mine = await browser.newContext({ viewport });
  const theirs = await browser.newContext({ viewport });
  await theirs.grantPermissions(["geolocation"]);
  await theirs.setGeolocation({ latitude: area.lat, longitude: area.lng, accuracy: 20 });
  await applySession(mine, rescuer);
  await applySession(theirs, other);
  const page = await mine.newPage();
  const otherPage = await theirs.newPage();

  // กู้ภัยหน่วยอื่นเปิดรายการเคสค้างไว้
  await otherPage.goto("/rescue/cases");
  const otherCard = otherPage.getByTestId("rescue-case-card").filter({ hasText: `${tag}-UI` });
  await expect(otherCard).toContainText("รับเคสแล้ว");

  await page.goto("/rescue/my-tasks");
  const card = page.getByTestId("my-task-card").filter({ hasText: `${tag}-UI` });
  await expect(card.getByTestId("my-task-status")).toHaveText("รับเคสแล้ว");
  await expect(card.getByRole("link", { name: "นำทางไปจุดเกิดเหตุ" })).toHaveAttribute(
    "href",
    `https://www.google.com/maps/dir/?api=1&destination=${area.lat},${area.lng}`,
  );
  await card.getByRole("button", { name: "แสดงเบอร์โทร" }).click();
  await expect(card.getByRole("link", { name: "โทร 0892600026" })).toBeVisible();

  // ปุ่มสถานะถัดไปมีปุ่มเดียว สูงอย่างน้อย 56px
  for (const [label, status] of [
    ["เริ่มเดินทาง", "กำลังเดินทาง"],
    ["ถึงที่เกิดเหตุ", "ถึงจุดเกิดเหตุ"],
  ] as const) {
    const next = card.getByRole("button", { name: label });
    expect((await next.boundingBox())!.height).toBeGreaterThanOrEqual(56);
    for (const other of ["เริ่มเดินทาง", "ถึงที่เกิดเหตุ", "ช่วยเสร็จแล้ว"].filter(
      (x) => x !== label,
    )) {
      await expect(card.getByRole("button", { name: other })).toHaveCount(0);
    }
    await next.click();
    await expect(card.getByTestId("my-task-status")).toHaveText(status);
    // หน้ารายการของกู้ภัยคนอื่นอัปเดตเองโดยไม่กดรีโหลด (Realtime / ดึงสำรองทุก 15 วิ)
    // รอได้ 35 วิ = ถ้า Realtime พลาด การดึงสำรองยังมีโอกาส 2 รอบ (CI ที่ทำงานหนัก)
    await expect(otherCard).toContainText(status, { timeout: 35_000 });
  }

  // โน้ตระหว่างทำงาน
  await card.getByLabel("โน้ตระหว่างทำงาน").fill("ถนนน้ำท่วมสูง อ้อมทางวัด");
  await card.getByRole("button", { name: "บันทึกโน้ต" }).click();
  await expect(card.getByRole("list", { name: "โน้ตล่าสุด" })).toContainText(
    "ถนนน้ำท่วมสูง อ้อมทางวัด",
  );

  // ช่วยเสร็จแล้ว: ต้องเลือกผลและจำนวนคน
  await card.getByRole("button", { name: "ช่วยเสร็จแล้ว" }).click();
  await card.getByLabel("จำนวนคนที่ช่วยได้").fill("2");
  await card.getByRole("button", { name: "ยืนยัน ช่วยเสร็จแล้ว" }).click();
  await expect(card.getByRole("alert")).toHaveText("กรุณาเลือกผลการช่วยเหลือ");
  await card.getByRole("radio", { name: "ช่วยได้" }).check();
  await card.getByRole("button", { name: "ยืนยัน ช่วยเสร็จแล้ว" }).click();
  await expect(card.getByTestId("my-task-status")).toHaveText("รอผู้แจ้งยืนยัน");
  await expect(card.getByText("ช่วยเสร็จแล้ว รอผู้แจ้งยืนยันปิดเคส")).toBeVisible();
  await expect(
    card.getByRole("button", { name: /เริ่มเดินทาง|ถึงที่เกิดเหตุ|ช่วยเสร็จแล้ว/ }),
  ).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // เคสที่รอผู้แจ้งยืนยันหายจากรายการเคสที่ยังต้องช่วยของคนอื่น
  await expect(otherCard).toHaveCount(0, { timeout: 35_000 });

  const { data: row } = await adminDb().from("cases").select("status").eq("id", item.id).single();
  expect(row?.status).toBe("AWAITING_CONFIRMATION");
  const { data: events } = await adminDb()
    .from("case_events")
    .select("event_type, to_status, metadata")
    .eq("case_id", item.id)
    .order("created_at");
  expect(events?.map((event) => [event.event_type, event.to_status])).toEqual([
    ["ACCEPTED", "ACCEPTED"],
    ["STATUS_CHANGED", "EN_ROUTE"],
    ["STATUS_CHANGED", "ON_SITE"],
    ["NOTE_ADDED", "ON_SITE"],
    ["STATUS_CHANGED", "AWAITING_CONFIRMATION"],
  ]);
  expect(events?.at(-1)?.metadata).toMatchObject({ outcome: "HELPED", peopleHelped: 2 });

  await mine.close();
  await theirs.close();
});

test("กดเลื่อนสถานะพร้อมกัน 2 session (คนรับเคส + หัวหน้า) ได้คนเดียวทุกรอบ", async () => {
  for (let round = 0; round < 5; round++) {
    const item = await acceptedCase(`${tag}-R${round}`);
    const results = await Promise.all(
      [rescuer, lead].map((account) =>
        clientOf(account).rpc("advance_case_status", {
          p_case_id: item.id,
          p_expected_version: item.version,
          p_to_status: "EN_ROUTE",
        }),
      ),
    );
    for (const result of results) expect(result.error).toBeNull();
    expect(results.map((result) => result.data.status).sort()).toEqual(["STALE", "UPDATED"]);
    const { count } = await adminDb()
      .from("case_events")
      .select("id", { count: "exact", head: true })
      .eq("case_id", item.id)
      .eq("event_type", "STATUS_CHANGED");
    expect(count).toBe(1);
    // ปิดเคสรอบนี้ก่อน ไม่งั้นรอบถัดไปติดเพดานถือ 2 เคสของ TF-25
    await closeTestCases([item.id]);
  }
});

test("คนรับเคสปิดเคสเองไม่ได้ (RESOLVED / CANCELLED / DUPLICATE / UNREACHABLE)", async () => {
  const item = await acceptedCase(`${tag}-CLOSE`);
  for (const status of ["RESOLVED", "CANCELLED", "DUPLICATE", "UNREACHABLE"]) {
    const { error } = await clientOf(rescuer).rpc("advance_case_status", {
      p_case_id: item.id,
      p_expected_version: item.version,
      p_to_status: status,
    });
    expect(error?.code, status).toBe("22023");
  }
  const { error: directError } = await clientOf(rescuer)
    .from("cases")
    .update({ status: "RESOLVED" })
    .eq("id", item.id);
  const { data: row } = await adminDb().from("cases").select("status").eq("id", item.id).single();
  expect(directError !== null || row?.status === "ACCEPTED").toBe(true);
  expect(row?.status).toBe("ACCEPTED");
});
