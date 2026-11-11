// npm run env:sync — อัปเดต URL/คีย์ Supabase ใน .env.local ให้ตรงกับ Supabase ในเครื่อง (TF-68)
//   สำรองไฟล์เดิมเป็น .env.local.bak ก่อนแก้ · ไม่พิมพ์ค่าคีย์ บอกแค่ชื่อตัวที่เปลี่ยน
// npm run env:sync -- --check — ตรวจอย่างเดียว ไม่แก้ไฟล์ (ไม่ตรง = exit 1) ใช้ใน e2e/global-setup.ts
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseStatusEnv, syncEnvText } from "./local-env.ts";

const ENV_FILE = ".env.local";
const checkOnly = process.argv.includes("--check");

let statusText: string;
try {
  statusText = execFileSync("npx", ["supabase", "status", "-o", "env"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
} catch {
  console.error("อ่านค่า Supabase ในเครื่องไม่ได้ — เปิด Supabase ก่อน: npm run db:start");
  process.exit(2);
}

const current = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
const { text, changed, missing } = syncEnvText(current, parseStatusEnv(statusText));

if (missing.length > 0) {
  console.error(`supabase status ไม่มีค่า ${missing.join(", ")} — ลองอัปเดต Supabase CLI`);
  process.exit(2);
}

if (changed.length === 0) {
  console.log(`${ENV_FILE} ตรงกับ Supabase ในเครื่องแล้ว`);
  process.exit(0);
}

if (checkOnly) {
  console.error(
    `${ENV_FILE} ไม่ตรงกับ Supabase ในเครื่อง: ${changed.join(", ")}\n` +
      "แก้ด้วย: npm run env:sync (สำรองไฟล์เดิมเป็น .env.local.bak ให้) แล้วเปิด npm run dev ใหม่",
  );
  process.exit(1);
}

if (existsSync(ENV_FILE)) copyFileSync(ENV_FILE, `${ENV_FILE}.bak`);
writeFileSync(ENV_FILE, text);
console.log(`อัปเดต ${ENV_FILE} แล้ว: ${changed.join(", ")}`);
if (existsSync(`${ENV_FILE}.bak`)) console.log(`ไฟล์เดิมสำรองไว้ที่ ${ENV_FILE}.bak`);
console.log("ถ้าเปิด npm run dev อยู่ ให้ปิดแล้วเปิดใหม่ เพื่อให้ใช้ค่าใหม่");
