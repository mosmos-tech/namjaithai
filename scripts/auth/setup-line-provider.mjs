// ลงทะเบียน LINE Login เป็น provider "custom:line" ใน Supabase (TF-17)
// รัน: npm run auth:setup-line   (อ่านค่าจาก .env.local)
//
// ทำไมต้องมีสคริปต์: Supabase เก็บค่า custom provider ไว้ในฐานข้อมูล ไม่ใช่ใน config.toml
// จึงหายทุกครั้งที่ npm run db:reset — รันสคริปต์นี้ซ้ำได้เรื่อยๆ (มีแล้วจะอัปเดต ไม่มีจะสร้าง)
// ใช้กับ Supabase Cloud ได้ด้วย แค่ชี้ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY ไปที่ cloud
//
// ต้องตั้งใน LINE Developers Console (LINE Login channel → แท็บ LINE Login → Callback URL):
//   <NEXT_PUBLIC_SUPABASE_URL>/auth/v1/callback   เช่น http://127.0.0.1:54321/auth/v1/callback

import { createClient } from "@supabase/supabase-js";

const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SECRET_KEY: secretKey } = process.env;
const { LINE_CHANNEL_ID: channelId, LINE_CHANNEL_SECRET: channelSecret } = process.env;

const missing = Object.entries({
  NEXT_PUBLIC_SUPABASE_URL: url,
  SUPABASE_SECRET_KEY: secretKey,
  LINE_CHANNEL_ID: channelId,
  LINE_CHANNEL_SECRET: channelSecret,
})
  .filter(([, v]) => !v)
  .map(([k]) => k);
if (missing.length) {
  console.error(`ยังไม่ได้ตั้งค่าใน .env.local: ${missing.join(", ")}`);
  process.exit(1);
}

const IDENTIFIER = "custom:line";
// ใช้แบบ OAuth2 ไม่ใช่ OIDC: ไฟล์ OIDC ของ LINE ประกาศว่าเซ็น id_token ด้วย ES256
// แต่ล็อกอินแบบ Web app จริงได้ id_token ที่เซ็นด้วย HS256 (channel secret) Supabase จึงปฏิเสธ
// ("unexpected signature algorithm HS256") — แบบ OAuth2 ให้ Supabase ดึงโปรไฟล์จาก userinfo ของ LINE แทน
const PROVIDER_TYPE = "oauth2";
const config = {
  name: "LINE",
  client_id: channelId,
  client_secret: channelSecret,
  authorization_url: "https://access.line.me/oauth2/v2.1/authorize",
  token_url: "https://api.line.me/oauth2/v2.1/token",
  // ตอบ { sub: LINE user ID, name, picture } — userinfo ต้องใช้ scope openid
  userinfo_url: "https://api.line.me/oauth2/v2.1/userinfo",
  // ขอแค่ชื่อและรูป ไม่ขออีเมล (ต้องขออนุญาต LINE แยก และเราไม่ได้ใช้)
  scopes: ["openid", "profile"],
  pkce_enabled: true,
  email_optional: true,
  enabled: true,
};

const admin = createClient(url, secretKey, { auth: { persistSession: false } }).auth.admin
  .customProviders;

// เปลี่ยนชนิด provider ทีหลังไม่ได้ ถ้าของเดิมเป็นคนละชนิดให้ลบแล้วสร้างใหม่
let existing = await admin.getProvider(IDENTIFIER);
if (existing.data && existing.data.provider_type !== PROVIDER_TYPE) {
  await admin.deleteProvider(IDENTIFIER);
  existing = { data: null };
}
const result = existing.data
  ? await admin.updateProvider(IDENTIFIER, config)
  : await admin.createProvider({ provider_type: PROVIDER_TYPE, identifier: IDENTIFIER, ...config });

if (result.error) {
  console.error("ตั้งค่า LINE provider ไม่สำเร็จ:", result.error.message);
  process.exit(1);
}
console.log(
  `${existing.data ? "อัปเดต" : "สร้าง"} provider ${IDENTIFIER} แล้ว (Channel ID ${channelId})`,
);
console.log(`Callback URL ที่ต้องตั้งใน LINE: ${new URL("/auth/v1/callback", url).href}`);
