import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type WebSocketRoute,
} from "@playwright/test";
import { applySession, createAccount, deleteAccount, type TestAccount } from "./helpers/accounts";
import { adminDb, closeTestCases, createCaseViaApi, randomPhone, stepTestCase } from "./helpers/db";
import { saveEvidence } from "./helpers/evidence";
import { goToStep5, openFreshSosForm } from "./helpers/sos";

/**
 * TF-27 อัปเดตแบบเรียลไทม์
 * แยกจังหวัดระหว่าง desktop (พังงา) และ mobile (กระบี่) เพื่อรันขนานกันได้โดยไม่ชนกับ spec อื่น
 */
test.describe.configure({ mode: "serial" });

const AREAS: Record<
  string,
  {
    province: string;
    center: { lat: number; lng: number };
    mapPoint: { lat: number; lng: number };
    listPointA: { lat: number; lng: number };
    listPointB: { lat: number; lng: number };
  }
> = {
  desktop: {
    province: "พังงา",
    center: { lat: 8.7859, lng: 98.37592 },
    mapPoint: { lat: 8.84565, lng: 98.38391 },
    listPointA: { lat: 8.4671, lng: 98.60372 },
    listPointB: { lat: 8.5493, lng: 98.58482 },
  },
  mobile: {
    province: "กระบี่",
    center: { lat: 8.07145, lng: 98.91131 },
    mapPoint: { lat: 8.0979, lng: 98.90331 },
    listPointA: { lat: 8.0827, lng: 98.99165 },
    listPointB: { lat: 8.19895, lng: 98.87417 },
  },
};

let rescuer: TestAccount;
let adminAccount: TestAccount;
let reporterAccount: TestAccount;
let unitId: string;
let tag: string;
const createdCaseCodes: string[] = [];

test.beforeAll(async ({}, testInfo) => {
  const db = adminDb();
  const { province } = AREAS[testInfo.project.name];
  const prefix = `TF27${testInfo.project.name === "desktop" ? "D" : "M"}`;
  tag = `${prefix}${crypto.randomUUID().slice(0, 4)}`;

  // ปิดเคสที่ยังเปิดอยู่ทั้งหมดในจังหวัดทดสอบ (case_events เป็น append-only จึงปิดแทนลบ — TF-26 ปิดผ่าน RPC ของระบบ)
  // TF-39: เดิมปิดเฉพาะเคสที่ขึ้นต้นด้วย prefix — เคสเปิดค้างอื่นใกล้ mapPoint (รอบที่ถูกหยุดกลางคัน/ทดสอบมือ)
  // ถูกรวมกลุ่มกับเคสใหม่บนแผนที่ (cluster) จนไม่มีหมุดเดี่ยวให้เห็น test ล้มทั้งที่ระบบทำงานถูก
  // จังหวัดนี้ใช้เฉพาะไฟล์นี้ (desktop/mobile แยกกัน) จึงปิดทั้งจังหวัดได้ไม่กระทบ test อื่น
  const { data: leftovers } = await db
    .from("cases")
    .select("id")
    .eq("province", province)
    .eq("is_demo", false)
    .in("status", ["NEW", "ACCEPTED", "EN_ROUTE", "ON_SITE", "AWAITING_CONFIRMATION"])
    .throwOnError();
  await closeTestCases((leftovers ?? []).map((row) => row.id));

  rescuer = await createAccount({ displayName: `กู้ภัย ${tag}`, role: "RESCUER" });
  adminAccount = await createAccount({ displayName: `แอดมิน ${tag}`, role: "ADMIN" });
  reporterAccount = await createAccount({ displayName: `ผู้แจ้ง ${tag}`, role: "USER" });

  const { data: unit, error: unitError } = await db
    .from("units")
    .insert({ name: `หน่วย ${tag}`, province })
    .select("id")
    .single();
  if (unitError) throw unitError;
  unitId = unit.id;

  await db
    .from("unit_members")
    .insert({
      unit_id: unitId,
      user_id: rescuer.id,
      role_in_unit: "MEMBER",
      status: "APPROVED",
    })
    .throwOnError();
});

test.afterAll(async () => {
  const db = adminDb();
  if (createdCaseCodes.length > 0) {
    const { data: created } = await db
      .from("cases")
      .select("id")
      .in("case_code", createdCaseCodes)
      .throwOnError();
    await closeTestCases((created ?? []).map((row) => row.id));
  }
  if (unitId) await db.from("units").delete().eq("id", unitId);
  for (const account of [rescuer, adminAccount, reporterAccount]) {
    if (account) await deleteAccount(account);
  }
});

async function openAsRescuer(
  page: Page,
  context: BrowserContext,
  project: string,
  path: "/rescue" | "/rescue/map" | "/rescue/cases",
) {
  const { center } = AREAS[project];
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: center.lat, longitude: center.lng, accuracy: 20 });
  await applySession(context, rescuer);
  await page.goto(path);
}

test.describe("TF-27 อัปเดตแบบเรียลไทม์", () => {
  test("ส่ง SOS แล้วหมุดและสถานะขึ้นบนแผนที่ (/rescue/map) และรายการ (/rescue/cases) ภายใน 3 วินาที", async ({
    page,
    context,
    baseURL,
  }, testInfo) => {
    test.setTimeout(90_000);
    const { mapPoint, listPointA } = AREAS[testInfo.project.name];
    const db = adminDb();

    // 1) แผนที่กู้ภัย (/rescue/map)
    await openAsRescuer(page, context, testInfo.project.name, "/rescue/map");
    // หน้าจอกู้ภัยพร้อมจริงก่อนเริ่มนับ: แผนที่สร้าง source/layer หมุดเสร็จ และ Realtime เชื่อมแล้ว
    // (TF-39: เดิมรอแค่กล่องแผนที่ขึ้น บางครั้งเริ่มนับ 3 วิทั้งที่แผนที่ยังโหลดไม่เสร็จ)
    await expect(page.getByTestId("rescue-map-container")).toHaveAttribute(
      "data-map-ready",
      "true",
      { timeout: 15_000 },
    );
    await expect(page.getByTestId("rescue-live-status")).toHaveAttribute(
      "data-live-mode",
      "realtime",
      { timeout: 15_000 },
    );

    // TF-39 เกณฑ์ขอบเขตข้อ 1: วัดเวลาจริงตั้งแต่ส่ง SOS จนหมุดขึ้นบนแผนที่ ต้องไม่เกิน 3 วินาที
    const submittedAt = Date.now();
    const mapCase = await createCaseViaApi(baseURL!, {
      lat: mapPoint.lat,
      lng: mapPoint.lng,
      landmark: `${tag}-MAP-NEW`,
      dangerSigns: [],
      canSelfEvacuate: true,
    });
    createdCaseCodes.push(mapCase.caseCode);

    const pin = page.getByTestId(`map-pin-${mapCase.caseCode}`);
    await expect(pin).toBeVisible({ timeout: 3_000 });
    const pinMs = Date.now() - submittedAt;
    testInfo.annotations.push({ type: "SOS → หมุดบนแผนที่", description: `${pinMs} ms` });
    console.log(`[TF-39] ${testInfo.project.name} SOS → หมุดบนแผนที่ ${pinMs} ms`);
    expect(pinMs, "ส่ง SOS จนหมุดขึ้นบนแผนที่กู้ภัย (ms)").toBeLessThanOrEqual(3_000);
    await saveEvidence(page, "1-sos-pin-on-rescue-map", testInfo);

    // เปลี่ยนสถานะและความเร่งด่วนใน DB → สีและสถานะหมุดอัปเดตใน 3 วินาทีโดยไม่รีโหลดหน้า
    const { error: mapUpdateError } = await db
      .from("cases")
      .update({
        status: "ACCEPTED",
        urgency: "RED",
        assigned_unit_id: unitId,
      })
      .eq("case_code", mapCase.caseCode);
    if (mapUpdateError) throw mapUpdateError;

    await expect(pin).toHaveAttribute("data-status", "ACCEPTED", { timeout: 3_000 });
    await expect(pin).toHaveAttribute("data-urgency", "RED", { timeout: 3_000 });

    // 2) หน้าหลักกู้ภัย (/rescue) เชื่อม Realtime ได้และไม่ล้นจอ 375px
    await page.goto("/rescue");
    await expect(page.getByTestId("rescue-live-status")).toHaveAttribute(
      "data-live-mode",
      "realtime",
      { timeout: 15_000 },
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );

    // 3) หน้ารายการเคส (/rescue/cases)
    await page.goto("/rescue/cases");
    await expect(page.getByTestId("rescue-live-status")).toHaveAttribute(
      "data-live-mode",
      "realtime",
      { timeout: 15_000 },
    );

    const listCase = await createCaseViaApi(baseURL!, {
      lat: listPointA.lat,
      lng: listPointA.lng,
      landmark: `${tag}-LIST-NEW`,
      dangerSigns: ["UNCONSCIOUS"],
      canSelfEvacuate: false,
    });
    createdCaseCodes.push(listCase.caseCode);

    const card = page.getByTestId("rescue-case-card").filter({ hasText: listCase.caseCode });
    await expect(card).toBeVisible({ timeout: 3_000 });

    // TF-26: เลื่อนทีละขั้น (ข้ามขั้น NEW → EN_ROUTE ไม่ได้)
    await stepTestCase(listCase.caseCode, ["ACCEPTED", "EN_ROUTE"], { assigned_unit_id: unitId });

    await expect(card).toContainText("กำลังเดินทาง", { timeout: 3_000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });

  test("บทบาท ADMIN เชื่อมต่อ Realtime และรับเคสใหม่ใน 3 วินาที", async ({
    page,
    context,
    baseURL,
  }, testInfo) => {
    const { listPointB } = AREAS[testInfo.project.name];
    // TF-68: แอดมินเห็นเคสที่ยังไม่ปิดทั้งประเทศ หน้าละ 100 เคส (เคสแดงเก่าขึ้นก่อน)
    // เคสค้างจาก test ไฟล์อื่นในฐานข้อมูลในเครื่องดันเคสใหม่ไปหน้า 2 ได้ (รอบแรกผ่าน รอบต่อๆ ไปล้ม)
    // จึงกรองรัศมี 5 กม. รอบจุดทดสอบ ให้ test ขึ้นกับข้อมูลของตัวเองเท่านั้น
    await context.clearPermissions();
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({
      latitude: listPointB.lat,
      longitude: listPointB.lng,
      accuracy: 20,
    });
    await applySession(context, adminAccount);
    await page.goto("/rescue/cases");
    await page.getByLabel("รัศมีจากตำแหน่งของคุณ").selectOption("5000");
    await expect(page.getByTestId("case-count")).toBeVisible();

    await expect(page.getByTestId("rescue-live-status")).toHaveAttribute(
      "data-live-mode",
      "realtime",
      { timeout: 15_000 },
    );

    const adminCase = await createCaseViaApi(baseURL!, {
      lat: listPointB.lat,
      lng: listPointB.lng,
      landmark: `${tag}-ADMIN-NEW`,
      dangerSigns: ["UNCONSCIOUS"],
      canSelfEvacuate: false,
    });
    createdCaseCodes.push(adminCase.caseCode);

    const card = page.getByTestId("rescue-case-card").filter({ hasText: adminCase.caseCode });
    await expect(card).toBeVisible({ timeout: 3_000 });
  });

  test("ตัดการเชื่อมต่อ Realtime แล้วยังอัปเดตทุก 15 วินาที", async ({
    page,
    context,
    baseURL,
  }, testInfo) => {
    test.setTimeout(45_000);
    const { listPointA } = AREAS[testInfo.project.name];

    let blockRealtime = false;
    const activeSockets: { ws: WebSocketRoute; server: WebSocketRoute }[] = [];

    await page.routeWebSocket(/\/realtime\/v1\/websocket/, async (ws) => {
      if (blockRealtime) {
        await ws.close({ code: 4000, reason: "Simulated quota/disconnect" });
        return;
      }
      const server = ws.connectToServer();
      activeSockets.push({ ws, server });
    });

    await openAsRescuer(page, context, testInfo.project.name, "/rescue/cases");
    const liveBadge = page.getByTestId("rescue-live-status");
    await expect(liveBadge).toHaveAttribute("data-live-mode", "realtime", { timeout: 15_000 });

    // ตัดการเชื่อมต่อ WebSocket Realtime
    blockRealtime = true;
    for (const pair of activeSockets.splice(0)) {
      await pair.ws.close({ code: 4000, reason: "Simulated disconnect" }).catch(() => {});
      await pair.server.close({ code: 4000, reason: "Simulated disconnect" }).catch(() => {});
    }

    await expect(liveBadge).toHaveAttribute("data-live-mode", "polling", { timeout: 10_000 });
    await expect(liveBadge).toContainText("อัปเดตทุก 15 วินาที");

    const polledCase = await createCaseViaApi(baseURL!, {
      lat: listPointA.lat,
      lng: listPointA.lng,
      landmark: `${tag}-POLL-15S`,
    });
    createdCaseCodes.push(polledCase.caseCode);

    const card = page.getByTestId("rescue-case-card").filter({ hasText: polledCase.caseCode });
    await expect(card).toHaveCount(0);

    // ภายในรอบ 15 วินาที ข้อมูลเคสใหม่ต้องถูกดึงมาแสดงอัตโนมัติ
    await expect(card).toBeVisible({ timeout: 22_000 });
    await expect(liveBadge).toHaveAttribute("data-live-mode", "polling");
  });

  test("กลับมาเชื่อมต่อแล้ว catch-up ทันทีไม่ตกหล่นเคส", async ({
    page,
    context,
    baseURL,
  }, testInfo) => {
    test.setTimeout(45_000);
    const { listPointB } = AREAS[testInfo.project.name];

    let blockRealtime = false;
    const activeSockets: { ws: WebSocketRoute; server: WebSocketRoute }[] = [];

    await page.routeWebSocket(/\/realtime\/v1\/websocket/, async (ws) => {
      if (blockRealtime) {
        await ws.close({ code: 4000, reason: "Simulated outage" });
        return;
      }
      const server = ws.connectToServer();
      activeSockets.push({ ws, server });
    });

    await openAsRescuer(page, context, testInfo.project.name, "/rescue/cases");
    const liveBadge = page.getByTestId("rescue-live-status");
    await expect(liveBadge).toHaveAttribute("data-live-mode", "realtime", { timeout: 15_000 });

    // จำลองเน็ต/Realtime หลุดเข้าสู่โหมด polling
    blockRealtime = true;
    for (const pair of activeSockets.splice(0)) {
      await pair.ws.close({ code: 4000, reason: "Simulated outage" }).catch(() => {});
      await pair.server.close({ code: 4000, reason: "Simulated outage" }).catch(() => {});
    }
    await expect(liveBadge).toHaveAttribute("data-live-mode", "polling", { timeout: 10_000 });

    // สร้างเคสระหว่างที่ Realtime หลุดอยู่ (ต้องยังไม่ขึ้นทันที)
    const missedCase = await createCaseViaApi(baseURL!, {
      lat: listPointB.lat,
      lng: listPointB.lng,
      landmark: `${tag}-RECONNECT-CATCHUP`,
    });
    createdCaseCodes.push(missedCase.caseCode);

    const card = page.getByTestId("rescue-case-card").filter({ hasText: missedCase.caseCode });
    await expect(card).toHaveCount(0);

    // เปิด Realtime กลับมา → เมื่อ SUBSCRIBED ต้อง catch-up ทันทีโดยไม่ต้องรอครบ 15 วินาที
    blockRealtime = false;
    await expect(liveBadge).toHaveAttribute("data-live-mode", "realtime", { timeout: 20_000 });
    await expect(card).toBeVisible({ timeout: 3_000 });
  });

  test("ผู้แจ้ง (USER) และผู้ไม่ล็อกอินไม่เปิดการเชื่อมต่อ Realtime เลย", async ({
    page,
    context,
  }) => {
    const openedRealtimeSockets: string[] = [];
    page.on("websocket", (ws) => {
      if (ws.url().includes("realtime")) {
        openedRealtimeSockets.push(ws.url());
      }
    });

    // 1) ผู้ไม่ล็อกอินบนหน้าสาธารณะ
    for (const path of ["/", "/request", "/track", "/sos/sent"]) {
      await page.goto(path);
      await page.waitForTimeout(300);
    }
    expect(openedRealtimeSockets).toEqual([]);

    // 2) ผู้แจ้งที่ล็อกอิน (role = USER) รวมถึงกรณีลองเข้า /rescue
    await applySession(context, reporterAccount);
    for (const path of ["/my-cases", "/request", "/rescue/cases"]) {
      await page.goto(path);
      await page.waitForTimeout(300);
    }
    expect(openedRealtimeSockets).toEqual([]);
  });

  test("ปิด Realtime ทั้งระบบแล้วยังส่ง SOS ได้ปกติ และฝั่งกู้ภัยทำงานในโหมด 15 วินาที", async ({
    page,
    context,
  }, testInfo) => {
    test.setTimeout(60_000);
    await page.routeWebSocket(/\/realtime\/v1/, async (ws) => {
      await ws.close({ code: 4000, reason: "System-wide realtime disabled" });
    });
    await page.route("**/realtime/v1/**", (route) => route.abort());

    // ส่งฟอร์ม SOS จริงทุกขั้นตอนโดยไม่มี Realtime
    await openFreshSosForm(page);
    await goToStep5(page);
    await page.getByPlaceholder("เช่น สมชาย ใจดี (หรือชื่อเล่น)").fill("ผู้แจ้ง ปิดเรียลไทม์");
    await page.getByPlaceholder("เช่น 0812345678 หรือ 081-234-5678").fill(randomPhone());
    await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลเพื่อ/ }).check();
    await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลสุขภาพ/ }).check();

    const submitResponsePromise = page.waitForResponse(
      (res) => res.url().includes("/api/cases") && res.request().method() === "POST",
    );
    await page.getByTestId("step5-submit-button").click();
    const submitResponse = await submitResponsePromise;
    expect(submitResponse.status()).toBe(201);
    const body = (await submitResponse.json()) as { caseCode: string };
    createdCaseCodes.push(body.caseCode);

    const successBanner = page.getByTestId("step5-submit-success");
    await expect(successBanner).toBeVisible({ timeout: 10_000 });
    await expect(successBanner).toContainText(body.caseCode);
    await successBanner.getByRole("link", { name: "ดูรายละเอียดการแจ้งและติดตามเคส" }).click();
    await expect(page).toHaveURL(/\/sos\/sent$/, { timeout: 10_000 });
    await expect(page.getByText(body.caseCode, { exact: true })).toBeVisible();

    // ฝั่งกู้ภัยเปิดหน้ารายการและแผนที่ได้ปกติในโหมด 15 วินาทีและไม่ล้นจอ 375px
    await openAsRescuer(page, context, testInfo.project.name, "/rescue/cases");
    await expect(page.getByTestId("rescue-live-status")).toHaveAttribute(
      "data-live-mode",
      "polling",
      { timeout: 10_000 },
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );

    await page.goto("/rescue/map");
    await expect(page.getByTestId("rescue-live-status")).toHaveAttribute(
      "data-live-mode",
      "polling",
      { timeout: 10_000 },
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
});
