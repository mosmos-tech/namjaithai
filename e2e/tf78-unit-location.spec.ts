import { expect, test, type Page } from "@playwright/test";
import { adminDb } from "./helpers/db";
import { applySession, createAccount, deleteAccount, type TestAccount } from "./helpers/accounts";

let admin: TestAccount;
let lead: TestAccount;
let other: TestAccount;
let ownUnit: string;
let otherUnit: string;
let name: string;
test.beforeAll(async () => {
  const tag = crypto.randomUUID().slice(0, 8);
  name = `TF78 ${tag}`;
  admin = await createAccount({ displayName: `${name} admin`, role: "ADMIN" });
  lead = await createAccount({ displayName: `${name} lead`, role: "UNIT_LEAD" });
  other = await createAccount({ displayName: `${name} user`, role: "USER" });
  const db = adminDb();
  const own = await db
    .from("units")
    .insert({ name, province: "เชียงใหม่" })
    .select("id")
    .single()
    .throwOnError();
  const foreign = await db
    .from("units")
    .insert({ name: `${name} other`, province: "เชียงใหม่" })
    .select("id")
    .single()
    .throwOnError();
  ownUnit = own.data!.id;
  otherUnit = foreign.data!.id;
  await db
    .from("unit_members")
    .insert({ unit_id: ownUnit, user_id: lead.id, role_in_unit: "LEAD", status: "APPROVED" })
    .throwOnError();
});
test.afterAll(async () => {
  if (ownUnit && otherUnit)
    await adminDb().from("units").update({ is_active: false }).in("id", [ownUnit, otherUnit]);
  await Promise.all([admin, lead, other].filter(Boolean).map(deleteAccount));
});
async function mockArea(page: Page, province = "เชียงใหม่") {
  await page.route("**/api/geo/reverse?**", (route) =>
    route.fulfill({
      json: {
        province: { code: 50, nameTh: province },
        district: { code: 5001, nameTh: "เมือง" },
        subdistrict: { code: 500101, nameTh: "ศรีภูมิ" },
        distanceM: 0,
      },
    }),
  );
}
test("หัวหน้าตั้งพิกัดด้วยลิงก์ GPS และไม่แก้หน่วยอื่น", async ({ page, context }) => {
  await applySession(context, lead);
  await mockArea(page);
  await page.goto("/unit");
  const panel = page.getByRole("region", { name: "ตั้งพิกัดหน่วย" });
  await expect(panel.getByRole("option", { name: `${name} other` })).toHaveCount(0);
  await panel.getByLabel("ลิงก์ Google Maps").fill("https://www.google.com/maps?q=18.7883,98.9853");
  await panel.getByRole("button", { name: "ใช้ลิงก์ Google Maps" }).click();
  await expect(panel.getByText("พื้นที่: ศรีภูมิ · เมือง · เชียงใหม่")).toBeVisible();
  await panel.getByRole("button", { name: "บันทึกพิกัดหน่วย" }).click();
  await expect(panel.getByText("บันทึกพิกัดหน่วยแล้ว")).toBeVisible();
  const own = await adminDb()
    .from("units")
    .select("location_lat,location_lng")
    .eq("id", ownUnit)
    .single()
    .throwOnError();
  expect(own.data!.location_lat).toBeCloseTo(18.7883, 4);
  const denied = await context.request.post("/api/unit-location", {
    data: { unitId: otherUnit, lat: 18.78, lng: 98.98 },
  });
  expect(denied.status()).toBe(403);
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 18.79, longitude: 98.99 });
  await panel.getByRole("button", { name: /ใช้ตำแหน่งปัจจุบัน/ }).click();
  await expect(panel.getByText(/ตำแหน่งที่เลือก: 18\.79000, 98\.99000/)).toBeVisible();
  await expect(panel.getByText("พื้นที่: ศรีภูมิ · เมือง · เชียงใหม่")).toBeVisible();
  await panel.getByRole("button", { name: "บันทึกพิกัดหน่วย" }).click();
  await expect
    .poll(
      async () =>
        (await adminDb().from("units").select("location_lat").eq("id", ownUnit).single()).data
          ?.location_lat,
    )
    .toBeCloseTo(18.79, 4);
  await context.grantPermissions([]);
  await panel.getByRole("button", { name: /ใช้ตำแหน่งปัจจุบัน/ }).click();
  await expect(panel.getByRole("alert")).toContainText("ใช้ GPS ไม่ได้หรือไม่ได้รับอนุญาต");
  await panel.getByLabel("ลิงก์ Google Maps").fill("https://www.google.com/maps?q=18.7883,98.9853");
  await panel.getByRole("button", { name: "ใช้ลิงก์ Google Maps" }).click();
  await expect(panel.getByRole("alert")).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "บันทึกพิกัดหน่วย" })).toBeEnabled();
});
test("แอดมินปักหมุดและตรวจจังหวัดก่อนบันทึก", async ({ page, context }) => {
  await applySession(context, admin);
  await mockArea(page, "กรุงเทพมหานคร");
  await page.goto("/admin");
  await page.getByLabel("เลือกหน่วย", { exact: true }).selectOption(ownUnit);
  const picker = page.getByRole("group", { name: `พิกัดที่ตั้งหน่วย ${name}` });
  const map = picker.getByTestId("step3-map-container");
  const canvas = map.locator("canvas");
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  const before = await adminDb().from("units").select("location_lat").eq("id", ownUnit).single().throwOnError();
  await canvas.click({ position: { x: 50, y: 50 } });
  await expect(map).toHaveAttribute("data-pin-lat", /.+/);
  await expect(picker.getByText(/จังหวัดไม่ตรงกับหน่วย/)).toBeVisible();
  page.once("dialog", (dialog) => dialog.dismiss());
  await picker.getByRole("button", { name: "บันทึกพิกัดหน่วย" }).click();
  const original = await adminDb()
    .from("units")
    .select("location_lat")
    .eq("id", ownUnit)
    .single()
    .throwOnError();
  expect(original.data!.location_lat).toBe(before.data!.location_lat);
  page.once("dialog", (dialog) => dialog.accept());
  await picker.getByRole("button", { name: "บันทึกพิกัดหน่วย" }).click();
  await expect
    .poll(
      async () =>
        (await adminDb().from("units").select("location_lat").eq("id", ownUnit).single()).data
          ?.location_lat,
    )
    .not.toBeNull();
});
test("ผู้ใช้ทั่วไปไม่มีสิทธิ์แก้พิกัด", async ({ context }) => {
  await applySession(context, other);
  expect(
    (
      await context.request.post("/api/unit-location", {
        data: { unitId: ownUnit, lat: 18.78, lng: 98.98 },
      })
    ).status(),
  ).toBe(403);
});
