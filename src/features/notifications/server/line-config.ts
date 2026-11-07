import { parseSuperAdminLineIds } from "@/lib/domain";
import { createAdminClient } from "@/lib/supabase/admin";
import type { LineWorkerConfig, NotificationClient } from "../line-worker";

/** ค่าตั้งของ worker LINE จาก environment ฝั่งเซิร์ฟเวอร์ (ไม่มีค่าลับในโค้ด) */
export function lineWorkerConfigFromEnv(fallbackBaseUrl?: string): LineWorkerConfig {
  return {
    db: createAdminClient() as unknown as NotificationClient,
    token: process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN,
    baseUrl: process.env.APP_BASE_URL ?? fallbackBaseUrl,
    appEnv: process.env.NEXT_PUBLIC_APP_ENV,
    superAdminLineIds: parseSuperAdminLineIds(process.env.SUPER_ADMIN_LINE_IDS),
  };
}
