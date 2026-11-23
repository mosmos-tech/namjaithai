import type { Metadata } from "next";
import { Suspense } from "react";
import { TrackCaseView, TrackLoading } from "@/features/sos/components/TrackCaseView";

export const metadata: Metadata = {
  title: "สถานะเคส — น้ำใจไทย SOS",
  robots: { index: false, follow: false },
  // URL มี tracking token: ส่งไปเว็บอื่นได้แค่โดเมน (ไม่มี path/query) — TF-77: ห้าม no-referrer
  // เพราะ tile.openstreetmap.org บังคับให้มี Referer ไม่งั้นตอบ 403 Access blocked
  referrer: "strict-origin",
};

// รหัสเคสและ token รู้ตอนมีคนเปิดเท่านั้น (Cache Components) เลยต้องครอบ Suspense
export default function TrackCasePage({ params, searchParams }: PageProps<"/track/[code]">) {
  return (
    <Suspense fallback={<TrackLoading />}>
      <TrackCaseView params={params} searchParams={searchParams} />
    </Suspense>
  );
}
