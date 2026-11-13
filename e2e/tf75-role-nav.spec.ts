import { expect, test } from "@playwright/test";
import { adminDb } from "./helpers/db";
import { applySession, createAccount } from "./helpers/accounts";

for (const [role, home, links] of [
  ["ADMIN", "/admin", ["ห้องสั่งการ", "จัดการเคส", "บันทึกการตรวจสอบ", "แผนที่เคส", "หน่วยกู้ภัย"]],
  ["UNIT_LEAD", "/unit", ["แผนที่เคส", "รายการเคส", "งานของฉัน", "จัดการหน่วย", "ผลงานหน่วย"]],
  ["RESCUER", "/rescue", ["แผนที่เคส", "รายการเคส", "งานของฉัน", "ผลงานหน่วย"]],
] as const) {
  test(`TF-75 ${role} เห็นเมนูงานและรักษา session ผ่านหน้า static`, async ({
    page,
    context,
  }, info) => {
    test.setTimeout(90_000);
    const account = await createAccount({ role, displayName: `TF75 ${role}` });
    if (role === "RESCUER") {
      const db = adminDb();
      const { data: unit } = await db
        .from("units")
        .insert({ name: `TF75 ${crypto.randomUUID()}`, province: "ตราด" })
        .select("id")
        .single()
        .throwOnError();
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
    await applySession(context, account);
    if (info.project.name === "mobile") await page.setViewportSize({ width: 360, height: 800 });
    for (const path of [home, "/request", "/en/request"]) {
      await page.goto(path);
      const nav = page.getByRole("navigation").first();
      await expect(nav).toHaveAttribute("data-nav-role", role);
      if (info.project.name === "mobile")
        await nav.getByRole("button", { name: /เปิดเมนู|Open menu/ }).click();
      for (const label of links)
        await expect(nav.getByRole("link", { name: label, exact: true }).last()).toBeVisible();
      await expect(nav.getByRole("link", { name: /แจ้งขอความช่วยเหลือ|Request help/ })).toHaveCount(
        0,
      );
      await expect(nav.locator('a[href="/login"]')).toHaveCount(0);
      expect(await nav.locator("a").first().getAttribute("href")).toBe(home);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    for (const label of links) {
      const nav = page.getByRole("navigation").first();
      if (
        info.project.name === "mobile" &&
        (await nav.getByRole("button", { name: /เปิดเมนู|Open menu/ }).count())
      ) {
        await nav.getByRole("button", { name: /เปิดเมนู|Open menu/ }).click();
      }
      const link = nav.getByRole("link", { name: label, exact: true }).last();
      const href = await link.getAttribute("href");
      await link.click();
      await expect(page).toHaveURL(new RegExp(`${href}$`));
      await expect(page.getByRole("navigation").first()).toHaveAttribute("data-nav-role", role);
      if (info.project.name === "mobile")
        await page
          .getByRole("navigation")
          .first()
          .getByRole("button", { name: "เปิดเมนู" })
          .click();
      await expect(
        page.getByRole("navigation").first().getByRole("link", { name: label, exact: true }).last(),
      ).toHaveAttribute("aria-current", "page");
      if (info.project.name === "mobile")
        await page.getByRole("navigation").first().getByRole("button", { name: "ปิดเมนู" }).click();
    }
  });
}

test("TF-75 ผู้ใช้ทั่วไปและผู้เยี่ยมชมยังเห็นเมนูสาธารณะ", async ({ page, context }, info) => {
  if (info.project.name === "mobile") await page.setViewportSize({ width: 360, height: 800 });
  for (const signedIn of [false, true]) {
    if (signedIn)
      await applySession(context, await createAccount({ role: "USER", displayName: "TF75 user" }));
    await page.goto("/request");
    const nav = page.getByRole("navigation").first();
    if (info.project.name === "mobile") await nav.getByRole("button", { name: "เปิดเมนู" }).click();
    await expect(
      nav.getByRole("link", { name: "แจ้งขอความช่วยเหลือ", exact: true }).last(),
    ).toBeVisible();
    await expect(
      nav.getByRole("link", { name: signedIn ? "หน้าของฉัน" : "เข้าสู่ระบบ", exact: true }).last(),
    ).toBeVisible();
    await expect(nav.getByRole("link", { name: "จัดการหน่วย", exact: true })).toHaveCount(0);
  }
});

test("TF-75 เปลี่ยนภาษาครั้งแรกยังรักษา session", async ({ page, context }, info) => {
  const admin = await createAccount({ role: "ADMIN", displayName: "TF75 locale admin" });
  await applySession(context, admin);
  const response = await context.request.get("/request", {
    headers: { "accept-language": "en-US,en;q=0.9", accept: "text/html" },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(307);
  await page.goto(response.headers().location);
  await expect(page).toHaveURL(/\/en\/request/);
  const nav = page.getByRole("navigation").first();
  if (info.project.name === "mobile") await nav.getByRole("button", { name: "Open menu" }).click();
  await expect(nav.getByRole("link", { name: "ห้องสั่งการ", exact: true }).last()).toBeVisible();
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin$/);
});

test("TF-75 เมนูและสายด่วนยังใช้ได้เมื่อโหลดบัญชีช้า", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "ตรวจเมนูมือถือ");
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/auth/navigation", async (route) => {
    await delayed;
    await route.fulfill({ json: { role: "ADMIN" } }).catch(() => {});
  });
  await page.goto("/request");
  await expect(page.locator('a[href="tel:1669"]').first()).toBeVisible();
  const button = page.getByRole("navigation").first().getByRole("button", { name: "เปิดเมนู" });
  await expect(button).toBeEnabled({ timeout: 4000 });
  await button.click();
  await expect(
    page.getByRole("link", { name: "แจ้งขอความช่วยเหลือ", exact: true }).last(),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation")
      .first()
      .getByRole("link", { name: "ตรวจสอบบัญชี", exact: true })
      .last(),
  ).toBeVisible();
  release();
  await expect(
    page
      .getByRole("navigation")
      .first()
      .getByRole("link", { name: "ห้องสั่งการ", exact: true })
      .last(),
  ).toBeVisible();
});
