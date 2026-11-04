import { createAdminClient } from "@/lib/supabase/admin";
import {
  deliverLineNotifications,
  deliverMemberLineNotifications,
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
  const db = createAdminClient() as unknown as NotificationClient;
  const token = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
  const baseUrl = process.env.APP_BASE_URL;

  const caseResult = await deliverLineNotifications({ db, token, baseUrl });
  if (caseResult.status !== 200) {
    return Response.json(caseResult.body, {
      status: caseResult.status,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const memberResult = await deliverMemberLineNotifications({ db, token, baseUrl });
  if (memberResult.status !== 200) {
    return Response.json(memberResult.body, {
      status: memberResult.status,
      headers: { "Cache-Control": "no-store" },
    });
  }
  return Response.json(
    {
      processed: (caseResult.body.processed ?? 0) + (memberResult.body.processed ?? 0),
      accepted: (caseResult.body.accepted ?? 0) + (memberResult.body.accepted ?? 0),
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
