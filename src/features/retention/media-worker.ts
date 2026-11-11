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
      console.error("[tf44-media] รับคิวลบรูปไม่สำเร็จ");
      return { status: 503, claimed: 0, deleted: 0, failed: 1 };
    }
    jobs = result.data as MediaJob[];
  } catch {
    console.error("[tf44-media] รับคิวลบรูปไม่สำเร็จ");
    return { status: 503, claimed: 0, deleted: 0, failed: 1 };
  }

  let deleted = 0;
  let failed = 0;
  for (const job of jobs) {
    let removed = false;
    if (job.storage_path.trim().length > 0) {
      try {
        const result = await client.remove([job.storage_path]);
        removed = !result.error;
      } catch {
        // ปล่อยคิวไว้ให้ลองใหม่เมื่อ Storage ไม่พร้อม
      }
    }
    try {
      const result = await client.rpc("finish_case_media_deletion", {
        p_id: job.id,
        p_lease_id: job.lease_id,
        p_success: removed,
      });
      if (removed && !result.error && result.data === true) deleted++;
      else {
        console.error(`[tf44-media] ลบรูปไม่สำเร็จ (คิว ${job.id})`);
        failed++;
      }
    } catch {
      // lease จะหมดเวลาและรับคิวได้อีกครั้งหากยืนยันผลไม่ได้
      console.error(`[tf44-media] ยืนยันผลลบรูปไม่สำเร็จ (คิว ${job.id})`);
      failed++;
    }
  }
  return { status: failed ? 503 : 200, claimed: jobs.length, deleted, failed };
}
