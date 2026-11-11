type MediaJob = { id: string; storage_path: string; lease_id: string };

export type MediaRetentionClient = {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
  remove(paths: string[]): PromiseLike<{ error: unknown }>;
};

export async function runMediaRetention(client: MediaRetentionClient) {
  let jobs: MediaJob[];
  try {
    const result = await client.rpc("claim_case_media_deletions", { p_limit: 10 });
    if (
      result.error ||
      !Array.isArray(result.data) ||
      !result.data.every(
        (item) =>
          typeof item?.id === "string" &&
          typeof item?.storage_path === "string" &&
          typeof item?.lease_id === "string",
      )
    ) {
      return { status: 503, claimed: 0, deleted: 0, failed: 1 };
    }
    jobs = result.data as MediaJob[];
  } catch {
    return { status: 503, claimed: 0, deleted: 0, failed: 1 };
  }

  let deleted = 0;
  let failed = 0;
  for (const job of jobs) {
    let removed = false;
    try {
      const result = await client.remove([job.storage_path]);
      removed = !result.error;
    } catch {
      // ปล่อยคิวไว้ให้ลองใหม่เมื่อ Storage ไม่พร้อม
    }
    try {
      const result = await client.rpc("finish_case_media_deletion", {
        p_id: job.id,
        p_lease_id: job.lease_id,
        p_success: removed,
      });
      if (removed && !result.error && result.data === true) deleted++;
      else failed++;
    } catch {
      // lease จะหมดเวลาและรับคิวได้อีกครั้งหากยืนยันผลไม่ได้
      failed++;
    }
  }
  return { status: failed ? 503 : 200, claimed: jobs.length, deleted, failed };
}
