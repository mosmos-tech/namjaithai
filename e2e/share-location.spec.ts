import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { adminDb, closeTestCases } from "./helpers/db";
import { applySession, createAccount, type TestAccount } from "./helpers/accounts";

/**
 * TF-28 แชร์ตำแหน่งกู้ภัย (โหมดปฏิบัติงาน)
 * จังหวัดของ test นี้เอง (ไม่มีไฟล์อื่นใช้): จอคอม = น่าน · มือถือ = พะเยา · หน่วยต่างจังหวัด = แพร่ (ไม่แชร์)
 * A กับ B อยู่หน่วยเดียวกัน · C อยู่หน่วยต่างจังหวัด · U ผู้ใช้ทั่วไป
 */
test.describe.configure({ mode: "serial" });

const AREAS = {
  desktop: {
    province: "น่าน",
    here: { lat: 18.7756, lng: 100.773 },
    far: { lat: 18.7936, lng: 100.773 },
  },
  mobile: {
    province: "พะเยา",
    here: { lat: 19.1666, lng: 99.9019 },
    far: { lat: 19.1846, lng: 99.9019 },
  },
} as const;

let area: (typeof AREAS)[keyof typeof AREAS];
let tag: string;
let a: TestAccount;
let b: TestAccount;
let c: TestAccount;
let user: TestAccount;
let admin: TestAccount;
const unitIds: string[] = [];
const caseIds: string[] = [];

function clientOf(account: TestAccount) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll: () => account.cookies, setAll: () => undefined } },
  );
}

async function rowOf(account: TestAccount) {
  const { data } = await adminDb()
    .from("rescuer_locations")
    .select("province, lat, lng")
    .eq("user_id", account.id)
    .maybeSingle();
  return data;
}

/** เปิดหน้าด้วยตำแหน่งที่กำหนด (context.setGeolocation) */
async function openAs(
  browser: Browser,
  account: TestAccount,
  path: string,
  point: { lat: number; lng: number },
  init?: (context: BrowserContext) => Promise<unknown>,
): Promise<Page> {
  const context = await browser.newContext({
    permissions: ["geolocation"],
    geolocation: { latitude: point.lat, longitude: point.lng, accuracy: 15 },
    viewport: { width: 375, height: 812 },
  });
  await init?.(context);
  await applySession(context, account);
  const page = await context.newPage();
  await page.goto(path);
  return page;
}

async function turnOn(page: Page) {
  const toggle = page.getByRole("switch", { name: "แชร์ตำแหน่ง (โหมดปฏิบัติงาน)" });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("duty-mode-status")).toContainText("กำลังแชร์ตำแหน่ง · ส่งล่าสุด");
}

test.beforeAll(async ({}, testInfo) => {
  area = AREAS[testInfo.project.name as keyof typeof AREAS] ?? AREAS.desktop;
  tag = `TF28${testInfo.project.name[0]}${crypto.randomUUID().slice(0, 6)}`;
  const db = adminDb();
  a = await createAccount({ displayName: `${tag} กู้ภัยเอ`, role: "RESCUER" });
  b = await createAccount({ displayName: `${tag} กู้ภัยบี`, role: "RESCUER" });
  c = await createAccount({ displayName: `${tag} กู้ภัยต่างจังหวัด`, role: "RESCUER" });
  user = await createAccount({ displayName: `${tag} ผู้ใช้`, role: "USER" });
  admin = await createAccount({ displayName: `${tag} แอดมิน`, role: "ADMIN" });
  for (const [province, members] of [
    [area.province, [a, b]],
    ["แพร่", [c]],
  ] as const) {
    const { data: unit } = await db
      .from("units")
      .insert({ name: `${tag} หน่วย${province}`, province })
      .select("id")
      .single()
      .throwOnError();
    unitIds.push(unit!.id);
    await db
      .from("unit_members")
      .insert(
        members.map((m) => ({
          unit_id: unit!.id,
          user_id: m.id,
          role_in_unit: "MEMBER",
          status: "APPROVED",
        })),
      )
      .throwOnError();
  }
});

test.afterAll(async () => {
  const db = adminDb();
  await closeTestCases(caseIds);
  const users = [a, b, c, user, admin].filter(Boolean).map((account) => account.id);
  await db.from("rescuer_locations").delete().in("user_id", users);
  if (unitIds.length) await db.from("units").update({ is_active: false }).in("id", unitIds);
  if (users.length) await db.from("users").update({ status: "SUSPENDED" }).in("id", users);
});

test("เปิดโหมดแล้วทีมจังหวัดเดียวกันและแอดมินเห็นหมุด ต่างจังหวัด/ผู้ใช้ทั่วไปไม่เห็น ปิดโหมดแล้วหมุดหายและไม่มีแถวค้าง", async ({
  browser,
}) => {
  const pageA = await openAs(browser, a, "/rescue/map", area.here);
  await turnOn(pageA);
  await expect.poll(() => rowOf(a)).toMatchObject({ province: area.province });

  const pageB = await openAs(browser, b, "/rescue/map", area.here);
  const pin = pageB.getByTestId(`team-pin-${a.id}`);
  await expect(pin).toHaveCount(1);
  await expect(pin).toHaveAttribute("data-state", "fresh");
  await expect(pin).toContainText(`${tag} กู้ภัยเอ`);
  // หมุดทีมแยกจากหมุดเคส
  await expect(pageB.getByText("ทีมกู้ภัยที่แชร์ตำแหน่ง")).toBeVisible();

  const ids = async (account: TestAccount) => {
    const { data } = await clientOf(account).rpc("list_team_locations");
    return ((data ?? []) as { user_id: string }[]).map((row) => row.user_id);
  };
  expect(await ids(admin)).toContain(a.id);
  expect(await ids(c)).not.toContain(a.id);
  expect(await ids(user)).not.toContain(a.id);
  const { data: direct } = await clientOf(user).from("rescuer_locations").select("user_id");
  expect(direct ?? []).toEqual([]);

  // ปิดโหมด: แถวถูกลบ และหมุดในจอของ B หายผ่าน Realtime
  await pageA.getByRole("switch", { name: "แชร์ตำแหน่ง (โหมดปฏิบัติงาน)" }).click();
  await expect(pageA.getByTestId("duty-mode-status")).toHaveText("ไม่ได้แชร์ตำแหน่ง");
  await expect.poll(() => rowOf(a)).toBeNull();
  await expect(pin).toHaveCount(0);
  await pageA.context().close();
  await pageB.context().close();
});

test("ไม่อัปเดตเกิน 2 นาทีเป็นสีจาง เกิน 15 นาทีไม่แสดง", async ({ browser }) => {
  const pageA = await openAs(browser, a, "/rescue/map", area.here);
  await turnOn(pageA);
  const pageB = await openAs(browser, b, "/rescue/map", area.here);
  const pin = pageB.getByTestId(`team-pin-${a.id}`);
  await expect(pin).toHaveAttribute("data-state", "fresh");

  // เลื่อนเวลาที่อัปเดตในฐานข้อมูลแทนการรอจริง
  const age = (minutes: number) =>
    adminDb()
      .from("rescuer_locations")
      .update({ recorded_at: new Date(Date.now() - minutes * 60_000).toISOString() })
      .eq("user_id", a.id)
      .throwOnError();
  await age(3);
  await expect(pin).toHaveAttribute("data-state", "stale");
  await expect(pin).toHaveAttribute("aria-label", /อัปเดต 3 นาทีที่แล้ว/);
  await age(16);
  await pageB.reload();
  await expect(pageB.getByTestId("rescue-map-container")).toBeVisible();
  await expect(pageB.getByTestId(`team-pin-${a.id}`)).toHaveCount(0);
  await pageA.context().close();
  await pageB.context().close();
});

test("สลับไปงานของฉันยังแชร์ต่อ ไปหน้าอื่นแล้วหยุดทันที", async ({ browser }) => {
  const page = await openAs(browser, a, "/rescue/map", area.here);
  await turnOn(page);
  await page.getByRole("link", { name: "งานของฉัน" }).first().click();
  await expect(page).toHaveURL(/\/rescue\/my-tasks$/);
  await expect(page.getByRole("switch", { name: "แชร์ตำแหน่ง (โหมดปฏิบัติงาน)" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  expect(await rowOf(a)).not.toBeNull();

  await page.getByRole("link", { name: "ดูรายการเคสที่รอรับ" }).click();
  await expect(page).toHaveURL(/\/rescue\/cases$/);
  await expect.poll(() => rowOf(a)).toBeNull();
  await page.context().close();
});

test("ปิดแท็บ และออกจากระบบ แล้วหยุดส่งทันที (ไม่มีแถวค้าง)", async ({ browser }) => {
  const page = await openAs(browser, a, "/rescue/my-tasks", area.here);
  await turnOn(page);
  await expect.poll(() => rowOf(a)).not.toBeNull();
  // ปิดแท็บ: pagehide ส่ง beacon ไปลบแถว
  await page.close({ runBeforeUnload: true });
  await expect.poll(() => rowOf(a)).toBeNull();

  const again = await page.context().newPage();
  await again.goto("/rescue/my-tasks");
  await turnOn(again);
  await expect.poll(() => rowOf(a)).not.toBeNull();
  await again.getByRole("button", { name: "ออกจากระบบ" }).click();
  await expect(again).toHaveURL(/\/$/);
  await expect.poll(() => rowOf(a)).toBeNull();
  await again.context().close();
});

test("เบราว์เซอร์ที่กันจอดับไม่ได้ บอกให้เปิดหน้าจอค้างไว้ และยังแชร์ได้", async ({ browser }) => {
  const page = await openAs(browser, b, "/rescue/my-tasks", area.here, (context) =>
    context.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "wakeLock", { get: () => undefined });
    }),
  );
  await turnOn(page);
  // (alert อีกตัวคือตัวประกาศเปลี่ยนหน้าของ Next.js)
  await expect(page.getByTestId("duty-mode").getByRole("alert")).toContainText(
    "กรุณาเปิดหน้าจอค้างไว้ระหว่างแชร์ตำแหน่ง",
  );
  await page.getByRole("switch", { name: "แชร์ตำแหน่ง (โหมดปฏิบัติงาน)" }).click();
  await expect.poll(() => rowOf(b)).toBeNull();
  await page.context().close();
});

test("ถึงที่เกิดเหตุ: เก็บระยะห่างเป็นเมตร (ไม่เก็บพิกัดกู้ภัย) · ไม่มีตำแหน่งบันทึก location_unavailable และแอดมินเห็นเป็นข้อมูลประกอบ", async ({
  browser,
}) => {
  const db = adminDb();
  const newCase = async (suffix: string) => {
    const code = `${tag}-${suffix}`.toUpperCase();
    const { data } = await db
      .from("cases")
      .insert({
        case_code: code,
        urgency: "YELLOW",
        lat: area.here.lat,
        lng: area.here.lng,
        province: area.province,
        landmark: `${tag} หน้าวัด`,
        incident_type: "FLOOD",
      })
      .select("id, version")
      .single()
      .throwOnError();
    caseIds.push(data!.id);
    await db
      .from("case_contacts")
      .insert({ case_id: data!.id, name: "ผู้แจ้ง TF28", phone: "0892800028", phone_last4: "0028" })
      .throwOnError();
    return { id: data!.id as string, version: data!.version as number, code };
  };
  const walkToScene = async (item: { id: string; version: number }) => {
    const rpc = clientOf(a);
    let { data: step } = await rpc.rpc("accept_case", {
      p_case_id: item.id,
      p_expected_version: item.version,
    });
    for (const to of ["EN_ROUTE", "ON_SITE"]) {
      ({ data: step } = await rpc.rpc("advance_case_status", {
        p_case_id: item.id,
        p_expected_version: step.version,
        p_to_status: to,
      }));
      expect(step.status, to).toBe("UPDATED");
    }
    return step.version as number;
  };
  const onSiteMetadata = async (id: string) => {
    const { data } = await db
      .from("case_events")
      .select("metadata")
      .eq("case_id", id)
      .eq("to_status", "ON_SITE")
      .single()
      .throwOnError();
    return data!.metadata as Record<string, unknown>;
  };

  // แชร์อยู่ห่างจากเคส ~2 กม.
  const page = await openAs(browser, a, "/rescue/my-tasks", area.far);
  await turnOn(page);
  const far = await newCase("FAR");
  await walkToScene(far);
  const farMeta = await onSiteMetadata(far.id);
  expect(farMeta.distanceToSceneM).toBeGreaterThan(1900);
  expect(farMeta.distanceToSceneM).toBeLessThan(2100);
  expect(Object.keys(farMeta)).not.toEqual(expect.arrayContaining(["lat"]));
  await page.getByRole("switch", { name: "แชร์ตำแหน่ง (โหมดปฏิบัติงาน)" }).click();
  await expect.poll(() => rowOf(a)).toBeNull();

  // ไม่แชร์: location_unavailable · ปิดเคสเร็วจึงติดด่าน "เร็วผิดปกติ" แต่ไม่ติด FAR_FROM_SCENE
  const noLoc = await newCase("NOLOC");
  const version = await walkToScene(noLoc);
  expect((await onSiteMetadata(noLoc.id)).sceneLocation).toBe("location_unavailable");
  const { data: done } = await clientOf(a).rpc("advance_case_status", {
    p_case_id: noLoc.id,
    p_expected_version: version,
    p_to_status: "AWAITING_CONFIRMATION",
    p_outcome: "HELPED",
    p_people_helped: 1,
  });
  expect(done.status).toBe("UPDATED");
  const { data: secret } = await db.rpc("confirmation_secret_for_case", {
    p_case_code: noLoc.code,
  });
  const { data: confirmed } = await db.rpc("reporter_confirm_case", {
    p_case_code: noLoc.code,
    p_token: secret,
    p_decision: "CONFIRM",
  });
  expect(confirmed.status).toBe("RESOLVED");
  const { data: review } = await db
    .from("case_performance_reviews")
    .select("reasons")
    .eq("case_id", noLoc.id)
    .single()
    .throwOnError();
  expect(review!.reasons).toEqual(["TOO_FAST"]);

  const adminPage = await openAs(browser, admin, "/admin", area.here);
  const item = adminPage.getByRole("listitem", { name: `เคส ${noLoc.code}` });
  await expect(item).toContainText("รับเคสถึงช่วยเสร็จไม่ถึง 5 นาที");
  await expect(item.getByTestId("performance-review-note")).toHaveText(
    "ข้อมูลประกอบ: ไม่มีข้อมูลตำแหน่งตอนถึงที่เกิดเหตุ",
  );
  await page.context().close();
  await adminPage.context().close();
});
