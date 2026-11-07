import {
  runLineNotifications,
  validWorkerAuthorization,
} from "@/features/notifications/line-worker";
import { lineWorkerConfigFromEnv } from "@/features/notifications/server/line-config";

export const maxDuration = 60;

// เรียกโดย pg_cron ทุกนาที (TF-34) พร้อม Authorization: Bearer <LINE_NOTIFICATIONS_SECRET>
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
  const result = await runLineNotifications(lineWorkerConfigFromEnv());
  return Response.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
