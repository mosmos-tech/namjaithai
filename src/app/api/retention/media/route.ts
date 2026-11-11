import { validWorkerAuthorization } from "@/features/notifications/line-worker";
import { runMediaRetention } from "@/features/retention/media-worker";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

export async function POST(request: Request) {
  if (
    !validWorkerAuthorization(
      request.headers.get("authorization"),
      process.env.RETENTION_WORKER_SECRET,
    )
  ) {
    return Response.json(
      { error: "ไม่มีสิทธิ์เรียกงานลบข้อมูล" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const client = createAdminClient();
    const result = await runMediaRetention({
      rpc: (name, args) => client.rpc(name, args),
      remove: (paths) => client.storage.from("case-media").remove(paths),
    });
    return Response.json(
      { claimed: result.claimed, deleted: result.deleted, failed: result.failed },
      { status: result.status, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "ไม่สามารถประมวลผลคิวได้" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
