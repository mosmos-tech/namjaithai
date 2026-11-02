import { createAdminClient } from "@/lib/supabase/admin";
import {
  deliverLineNotifications,
  validWorkerAuthorization,
  type NotificationClient,
} from "@/features/notifications/line-worker";

export const maxDuration = 60;

export async function POST(request: Request) {
  if (
    !validWorkerAuthorization(
      request.headers.get("authorization"),
      process.env.LINE_NOTIFICATIONS_SECRET,
    )
  )
    return Response.json(
      { error: "ไม่มีสิทธิ์เรียกงานแจ้งเตือน" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  const result = await deliverLineNotifications({
    db: createAdminClient() as unknown as NotificationClient,
    token: process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN,
    baseUrl: process.env.APP_BASE_URL,
  });
  return Response.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
