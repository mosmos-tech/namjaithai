import { formatThaiDateTime } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";

/**
 * แจ้งแอดมินเมื่อการส่ง LINE หยุดชั่วคราว (TF-34: โควตาข้อความรายเดือนหมด)
 * RLS ให้เฉพาะแอดมินอ่าน line_delivery_state — คนอื่นได้ค่าว่างและไม่เห็นอะไร
 */
export async function LineDeliveryNotice() {
  const db = await createClient();
  const { data } = await db
    .from("line_delivery_state")
    .select("paused_until, reason")
    .maybeSingle<{ paused_until: string | null; reason: string | null }>();
  if (!data?.paused_until || !isFuture(data.paused_until)) return null;

  return (
    <p
      role="alert"
      data-testid="line-delivery-paused"
      className="rounded-[12px] border border-red-600/30 bg-red-50 px-4 py-3 text-base text-red-600"
    >
      <strong className="font-semibold">แจ้งเตือน LINE หยุดส่งชั่วคราว</strong>
      {data.reason === "line_monthly_quota" ? " เพราะโควตาข้อความ LINE เดือนนี้หมด" : ""} ·
      ระบบจะเริ่มส่งอีกครั้ง {formatThaiDateTime(data.paused_until)}{" "}
      ระหว่างนี้ผู้แจ้งและกู้ภัยยังดูสถานะบนเว็บได้ตามปกติ
    </p>
  );
}

// แยกออกจาก render: เวลาปัจจุบันอ่านตอนดึงข้อมูล (หน้านี้ render ใหม่ทุกคำขอ)
function isFuture(iso: string): boolean {
  return new Date(iso).getTime() > Date.now();
}
