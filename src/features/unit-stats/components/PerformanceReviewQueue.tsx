import { createClient } from "@/lib/supabase/server";
import { PerformanceReviewItem } from "./PerformanceReviewItem";

export type PendingReview = {
  case_id: string;
  case_code: string;
  unit_name: string;
  reasons: string[];
  created_at: string;
};

/**
 * TF-57 คิวเคสที่ติดด่านกันปั๊มผลงาน (แอดมินเท่านั้น) — ไม่แสดงเบอร์ บอกแค่เหตุผลที่ติดด่าน
 * เคสในคิวยังไม่ถูกนับเป็นผลงานจนกว่าแอดมินกดผ่าน
 */
export async function PerformanceReviewQueue() {
  const supabase = await createClient();
  const { data: rows, error } = await supabase.rpc("pending_performance_reviews");
  if (error) return null;
  const data = (rows ?? []) as PendingReview[];
  return (
    <section
      aria-labelledby="performance-review-heading"
      className="flex flex-col gap-3 rounded-[14px] border p-4"
    >
      <h2 id="performance-review-heading" className="font-heading text-xl font-semibold">
        ตรวจผลงานที่ติดด่าน ({data.length})
      </h2>
      <p className="text-text-secondary">เคสเหล่านี้ยังไม่นับเป็นผลงานหน่วยจนกว่าจะกดผ่าน</p>
      {data.length === 0 ? (
        <p>ไม่มีเคสรอตรวจ</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.map((item) => (
            <PerformanceReviewItem key={item.case_id} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}
