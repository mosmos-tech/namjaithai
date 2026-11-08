import { normalizeThaiPhone } from "@/lib/domain";

/** ค่าตั้งของ SMS gateway จาก environment ฝั่งเซิร์ฟเวอร์ (ไม่มีค่าลับในโค้ด) — ดู docs/sms-gateway.md */
export function smsConfigFromEnv() {
  const gateway = process.env.NEXT_PUBLIC_SMS_GATEWAY_NUMBER?.trim();
  return {
    signingKey: process.env.HTTPSMS_WEBHOOK_SIGNING_KEY?.trim() ?? "",
    apiKey: process.env.HTTPSMS_API_KEY?.trim() ?? "",
    // เบอร์ซิมในเครื่อง gateway — ใช้เป็นเบอร์ผู้ส่งตอนตอบกลับ และเช็กว่า event มาจากเครื่องของเรา
    gatewayPhone: gateway ? normalizeThaiPhone(gateway) : null,
    baseUrl: process.env.APP_BASE_URL?.trim() || undefined,
  };
}
