import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type FullConfig } from "@playwright/test";
import { adminDb } from "./helpers/db";

// หน้าที่ test ใช้บ่อย — เปิดครั้งแรกให้ dev server compile ทั้งฝั่งเซิร์ฟเวอร์และ JS ของหน้าไว้ก่อน (TF-68)
// หน้าที่ต้องล็อกอินจะ redirect ไป /login แต่โค้ดฝั่งเซิร์ฟเวอร์ของหน้านั้นก็ compile แล้ว
const WARM_UP_PATHS = [
  "/", "/login", "/request", "/sos", "/sos/sent", "/track", "/my-cases", "/survival", "/hotlines",
  "/privacy", "/units", "/rescue", "/rescue/cases", "/rescue/map", "/rescue/my-tasks", "/unit",
  "/unit/dashboard", "/admin", "/admin/cases", "/admin/audit",
];

/**
 * TF-68: ใน CI dev server เพิ่งเปิด หน้าแรกที่ถูกเปิดต้อง compile 5–15 วินาที
 * test ที่บังเอิญเปิดหน้านั้นก่อนจะล้มเพราะรอนานเกิน (เช่น auth.spec กดไป /request แล้วรอ 6 วินาที)
 * เปิดทุกหน้าที่นี่ก่อนเริ่ม test แทนการเพิ่ม timeout และพิมพ์เวลาไว้ดูใน log ของ CI
 */
async function warmUpPages(baseURL: string) {
  const browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage();
  const started = Date.now();
  const timings: string[] = [];
  for (const path of WARM_UP_PATHS) {
    const t0 = Date.now();
    await page.goto(`${baseURL}${path}`, { waitUntil: "load", timeout: 120_000 });
    timings.push(`${path} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  await browser.close();
  console.log(`[global-setup] เปิดหน้าให้ compile ไว้ก่อน ${((Date.now() - started) / 1000).toFixed(1)}s: ${timings.join(" · ")}`);
}

/** TF-68: คีย์ใน .env.local ไม่ตรงกับ Supabase ในเครื่อง → Realtime ตอบ MalformedJWT (ในเครื่องเท่านั้น CI เขียนไฟล์ใหม่ทุกรอบ) */
function checkLocalEnv() {
  if (process.env.CI) return;
  try {
    execFileSync("npm", ["run", "--silent", "env:sync", "--", "--check"], { stdio: ["ignore", "ignore", "pipe"] });
  } catch (error) {
    const stderr = (error as { stderr?: Buffer }).stderr?.toString().trim();
    throw new Error(stderr || "ตรวจ .env.local ไม่สำเร็จ — รัน npm run env:sync");
  }
}

/**
 * TF-39: production build ฝังค่า NEXT_PUBLIC_* ไว้ตอน build — ถ้า build ด้วย URL/key คนละชุดกับ Supabase ที่ E2E ใช้
 * เบราว์เซอร์จะส่ง key เก่าไป Realtime แล้วโดน MalformedJWT (TF-68) จึงตรวจว่า JS ที่ build แล้วมี URL และ key ชุดปัจจุบัน
 */
function checkProductionBuild() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const chunks = join(".next", "static", "chunks");
  if (!existsSync(join(".next", "BUILD_ID")) || !existsSync(chunks)) {
    throw new Error("E2E_SERVER=production แต่ยังไม่มี production build — รัน npm run build ก่อน (หรือใช้ npm run e2e:prod)");
  }
  const files = readdirSync(chunks, { recursive: true }).filter((f) => String(f).endsWith(".js"));
  const embedded = files.some((file) => {
    const js = readFileSync(join(chunks, String(file)), "utf8");
    return js.includes(url!) && js.includes(key!);
  });
  if (!embedded) {
    throw new Error(
      "production build ใช้ Supabase URL/key คนละชุดกับ .env.local ตอนนี้ — รัน npm run build ใหม่ (หรือ npm run e2e:prod)",
    );
  }
}

/**
 * ก่อนรัน E2E ทุกครั้ง: ล้างตัวนับ rate limit ของการส่ง SOS/ติดตามเคส ในฐานข้อมูลในเครื่อง
 * ไม่งั้นรัน test ซ้ำหลายรอบใน 1 ชม. จะชนเพดาน IP ละ 20 เคส (TF-12) แล้วล้มแบบไม่เกี่ยวกับโค้ด
 */
export default async function globalSetup(config: FullConfig) {
  checkLocalEnv();
  const production = process.env.E2E_SERVER === "production";
  if (production) checkProductionBuild();
  // จุดเริ่มของตารางพิกัด test รอบนี้ (ดู uniqueTestPoint) — worker ทุกตัวได้ค่าเดียวกันผ่าน env
  process.env.E2E_LOCATION_SEED ??= String(Math.floor(Math.random() * 1800 * 1800));

  const db = adminDb();
  const { error } = await db.from("sos_rate_limit_hits").delete().gte("id", 0);
  if (error) throw new Error(`ล้าง rate limit ไม่สำเร็จ: ${error.message}`);

  // TF-51 ทดสอบแบบฟอร์มประเภทที่ยังไม่เปิดใช้งานจริง เฉพาะฐานข้อมูลท้องถิ่น
  const codes = ["ROAD_ACCIDENT", "ANIMAL"];
  const { data: original, error: readError } = await db
    .from("incident_types").select("code, is_enabled").in("code", codes);
  if (readError || original?.length !== codes.length) {
    throw new Error(`อ่านสถานะประเภทเหตุทดสอบไม่สำเร็จ: ${readError?.message ?? "ข้อมูลไม่ครบ"}`);
  }
  const restore = async () => {
    for (const row of original) {
      const { error: restoreError } = await db.from("incident_types")
        .update({ is_enabled: row.is_enabled }).eq("code", row.code);
      if (restoreError) throw new Error(`คืนสถานะประเภทเหตุทดสอบไม่สำเร็จ: ${restoreError.message}`);
    }
  };
  const { error: enableError } = await db.from("incident_types")
    .update({ is_enabled: true }).in("code", codes);
  if (enableError) {
    await restore();
    throw new Error(`เตรียมประเภทเหตุทดสอบไม่สำเร็จ: ${enableError.message}`);
  }

  // production build ไม่ต้อง compile ตอนเปิดหน้า จึงไม่ต้องเปิดหน้ารอไว้ก่อน
  if (production) return restore;
  try {
    await warmUpPages(config.projects[0]?.use.baseURL ?? "http://localhost:3000");
  } catch (error) {
    await restore();
    throw error;
  }
  return restore;
}
