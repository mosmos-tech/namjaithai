import { expect, test } from "@playwright/test";
import { adminDb, closeTestCases, stepTestCase } from "./helpers/db";
import { createAccount, type TestAccount } from "./helpers/accounts";

/**
 * TF-42 ผู้แจ้งติดตามทีมแบบแผนที่สด (แบบติดตามพัสดุ)
 * - รอทีม: ไม่มีแผนที่ · กำลังมา: หมุดทีม + เวลาที่คาดว่าจะถึง + ปุ่มโทรเบอร์หน่วย
 * - ทีมหยุดแชร์ → รอบ polling ถัดไปขึ้น "ไม่มีตำแหน่งล่าสุด" และหมุดหาย
 * - บล็อก tile แผนที่ → แผงล่างยังบอกสถานะ ทีม เวลา และโทรได้
 * - ถึงแล้ว → รอยืนยัน → "ฉันได้รับความช่วยเหลือแล้ว" ปิดเคสแบบ REPORTER_CONFIRMED (flow TF-58)
 * จังหวัดของ test นี้เอง (ไม่มีไฟล์อื่นใช้): จอคอม = เพชรบุรี · มือถือ = ประจวบคีรีขันธ์
 */
test.describe.configure({ mode: "serial" });

const AREAS = {
  desktop: { province: "เพชรบุรี", scene: { lat: 13.1119, lng: 99.9447 } },
  mobile: { province: "ประจวบคีรีขันธ์", scene: { lat: 11.812, lng: 99.7973 } },
} as const;
const UNIT_PHONE = "0994200042";

let area: (typeof AREAS)[keyof typeof AREAS];
let tag: string;
let rescuer: TestAccount;
let unitId: string;
const caseIds: string[] = [];

type TestCase = { id: string; code: string; token: string };

async function newCase(): Promise<TestCase> {
  const code = `FL-2611-42${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
  const { data } = await adminDb()
    .from("cases")
    .insert({
      case_code: code,
      urgency: "YELLOW",
      lat: area.scene.lat,
      lng: area.scene.lng,
      province: area.province,
      landmark: `${tag} จุดทดสอบ`,
      incident_type: "FLOOD",
    })
    .select("id, tracking_token")
    .single()
    .throwOnError();
  caseIds.push(data!.id);
  return { id: data!.id, code, token: data!.tracking_token };
}

/** กู้ภัยแชร์ตำแหน่งห่างจากเคสไปทางเหนือ northM เมตร (แบบที่ share_my_location ของ TF-28 บันทึก) */
async function shareLocation(northM: number) {
  const lat = area.scene.lat + northM / 110_700;
  await adminDb()
    .from("rescuer_locations")
    .upsert(
      {
        user_id: rescuer.id,
        location: `SRID=4326;POINT(${area.scene.lng} ${lat})`,
        lat,
        lng: area.scene.lng,
        is_sharing: true,
        recorded_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    .throwOnError();
}

async function stopSharing() {
  await adminDb().from("rescuer_locations").delete().eq("user_id", rescuer.id).throwOnError();
}

async function acceptedBy(item: TestCase) {
  await stepTestCase(item.code, ["ACCEPTED"], {
    assigned_rescuer_id: rescuer.id,
    assigned_unit_id: unitId,
  });
}

test.beforeAll(async ({}, testInfo) => {
  area = AREAS[testInfo.project.name as keyof typeof AREAS];
  tag = `TF42${testInfo.project.name[0]}${crypto.randomUUID().slice(0, 6)}`;
  rescuer = await createAccount({ displayName: `${tag} กู้ภัยชื่อจริง`, role: "RESCUER" });
  const { data: unit } = await adminDb()
    .from("units")
    .insert({ name: `${tag} หน่วยกู้ภัย`, province: area.province, contact_phone: UNIT_PHONE })
    .select("id")
    .single()
    .throwOnError();
  unitId = unit!.id;
  await adminDb()
    .from("unit_members")
    .insert({ unit_id: unitId, user_id: rescuer.id, role_in_unit: "MEMBER", status: "APPROVED" })
    .throwOnError();
});

test.afterAll(async () => {
  const db = adminDb();
  if (rescuer) await db.from("rescuer_locations").delete().eq("user_id", rescuer.id);
  await closeTestCases(caseIds.filter(Boolean));
  if (unitId) await db.from("units").update({ is_active: false }).eq("id", unitId);
  if (rescuer) await db.from("users").update({ status: "SUSPENDED" }).eq("id", rescuer.id);
});

test("กำลังมา: เห็นหมุดทีมและเวลาที่คาดว่าจะถึง ทีมหยุดแชร์แล้วขึ้นไม่มีตำแหน่งล่าสุด", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const item = await newCase();
  await acceptedBy(item);
  await shareLocation(1_800);

  // รอทีม (รับเคสแล้วแต่ยังไม่ออกเดินทาง): ไม่มีแผนที่ ทีมแชร์อยู่ก็ไม่เห็นตำแหน่ง
  await page.goto(`/track/${item.code}?t=${item.token}`);
  await expect(page.getByTestId("track-panel")).toContainText("ทีมรับเคสแล้ว");
  await expect(page.getByTestId("track-map")).toHaveCount(0);
  await expect(page.getByTestId("waiting-advice")).toBeVisible();

  await stepTestCase(item.code, ["EN_ROUTE"]);
  await page.reload();
  await expect(page.getByTestId("track-map")).toHaveAttribute("data-ready", "true", {
    timeout: 15_000,
  });
  await expect(page.getByTestId("track-team-pin")).toBeVisible();
  await expect(page.getByTestId("track-reporter-pin")).toBeVisible();
  // 1.8 กม. ÷ 30 กม./ชม. = 3.6 → ปัดขึ้น 4 นาที
  await expect(page.getByTestId("team-eta")).toHaveText("ถึงในประมาณ 4 นาที");
  await expect(page.getByTestId("team-live-info")).toContainText("ห่างจากคุณ 1.8 กม.");
  await expect(page.getByTestId("team-call")).toHaveAttribute("href", `tel:${UNIT_PHONE}`);
  await expect(page.getByTestId("track-last-updated")).toContainText("อัปเดตล่าสุด");
  // คำแนะนำระหว่างรอ: อยู่ใต้แผงสถานะ/ETA (ไม่บังแผนที่) เปิดเป็นค่าเริ่มต้น และพับได้
  const advice = page.getByTestId("waiting-advice");
  await expect(advice).toHaveAttribute("open", "");
  await expect(advice).toContainText("หลีกเลี่ยงการเดินหรือขับรถผ่านน้ำท่วม");
  const panelBox = (await page.getByTestId("track-panel").boundingBox())!;
  const adviceBox = (await advice.boundingBox())!;
  const mapBox = (await page.getByTestId("track-map").boundingBox())!;
  expect(adviceBox.y).toBeGreaterThanOrEqual(panelBox.y + panelBox.height);
  expect(mapBox.y + mapBox.height).toBeLessThanOrEqual(panelBox.y);
  await advice.getByText("ระหว่างรอทีม ควรทำอะไร").click();
  await expect(advice).not.toHaveAttribute("open", "");
  await expect(advice.getByText("หลีกเลี่ยงการเดินหรือขับรถผ่านน้ำท่วม")).toBeHidden();
  // ไม่มีชื่อกู้ภัยหลุดมาในหน้า
  await expect(page.getByText(rescuer.displayName)).toHaveCount(0);
  if (test.info().project.name === "mobile") {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }

  // ทีมปิดโหมดปฏิบัติงาน → รอบ polling ถัดไป (ทุก 20 วินาที) ไม่มีหมุดค้าง ไม่มีเวลาจากตำแหน่งเก่า
  await stopSharing();
  await expect(page.getByTestId("team-location-missing")).toContainText(
    "ไม่มีตำแหน่งล่าสุดของทีม",
    { timeout: 30_000 },
  );
  await expect(page.getByTestId("track-team-pin")).toHaveCount(0);
  await expect(page.getByTestId("team-eta")).toHaveCount(0);
  await expect(page.getByTestId("team-call")).toHaveAttribute("href", `tel:${UNIT_PHONE}`);
});

test("บล็อก tile แผนที่: แผงล่างยังบอกสถานะ ทีม เวลาที่คาดว่าจะถึง และโทรได้", async ({ page }) => {
  const item = await newCase();
  await acceptedBy(item);
  await stepTestCase(item.code, ["EN_ROUTE"]);
  await shareLocation(4_700);
  await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());

  await page.goto(`/track/${item.code}?t=${item.token}`);
  const panel = page.getByTestId("track-panel");
  await expect(panel).toContainText("กำลังเดินทาง");
  await expect(panel).toContainText(`${tag} หน่วยกู้ภัย`);
  await expect(page.getByTestId("team-eta")).toHaveText("ถึงในประมาณ 10 นาที");
  const call = page.getByTestId("team-call");
  await expect(call).toHaveAttribute("href", `tel:${UNIT_PHONE}`);
  await expect(call).toBeEnabled();
  expect((await call.boundingBox())!.height).toBeGreaterThanOrEqual(48);
});

test("ถึงแล้ว → รอยืนยัน: ปุ่ม 'ฉันได้รับความช่วยเหลือแล้ว' ปิดเคสแบบ REPORTER_CONFIRMED", async ({
  page,
}) => {
  const item = await newCase();
  await acceptedBy(item);
  await stepTestCase(item.code, ["EN_ROUTE", "ON_SITE"]);
  await shareLocation(30);
  const secret = await adminDb().rpc("confirmation_secret_for_case", { p_case_code: item.code });
  expect(secret.error).toBeNull();

  // เครื่องที่ส่ง SOS เก็บ token ยืนยันไว้ (TF-58)
  await page.goto("/");
  await page.evaluate(
    (ref) => localStorage.setItem("namjaithai:confirmation-cases", JSON.stringify([ref])),
    { caseCode: item.code, trackingToken: item.token, confirmationToken: secret.data as string },
  );

  // ถึงแล้ว: ยังไม่มีปุ่มยืนยัน (TF-58 ปิดได้เฉพาะ AWAITING_CONFIRMATION)
  await page.goto(`/track/${item.code}?t=${item.token}`);
  await expect(page.getByTestId("track-panel")).toContainText("ทีมถึงแล้ว");
  await expect(page.getByTestId("team-live-info")).toContainText("ทีมอยู่ใกล้คุณแล้ว");
  await expect(page.getByRole("button", { name: "ฉันได้รับความช่วยเหลือแล้ว" })).toHaveCount(0);
  // ทีมถึงแล้ว: ไม่ต้องแสดงคำแนะนำระหว่างรอ
  await expect(page.getByTestId("waiting-advice")).toHaveCount(0);

  await stepTestCase(item.code, ["AWAITING_CONFIRMATION"]);
  await page.reload();
  const confirm = page
    .getByRole("region", { name: "ยืนยันการช่วยเหลือ" })
    .getByRole("button", { name: "ฉันได้รับความช่วยเหลือแล้ว" });
  expect((await confirm.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await confirm.click();
  await expect(page.getByRole("region", { name: "ยืนยันการช่วยเหลือ" })).toHaveCount(0);

  const { data } = await adminDb()
    .from("cases")
    .select("status, close_confirmation")
    .eq("id", item.id)
    .single()
    .throwOnError();
  expect(data).toEqual({ status: "RESOLVED", close_confirmation: "REPORTER_CONFIRMED" });
});
