import type { Metadata } from "next";
import { Suspense } from "react";
import { TrackCaseView } from "@/features/sos/components/TrackCaseView";

export const metadata: Metadata = {
  title: "สถานะเคส — น้ำใจไทย SOS",
  robots: { index: false, follow: false },
  // URL มี tracking token ไม่ส่งต่อให้เว็บอื่นตอนกดลิงก์ออกไป
  referrer: "no-referrer",
};

// รหัสเคสและ token รู้ตอนมีคนเปิดเท่านั้น (Cache Components) เลยต้องครอบ Suspense
export default function TrackCasePage({ params, searchParams }: PageProps<"/track/[code]">) {
  return (
    <Suspense fallback={<TrackLoading />}>
      <TrackCaseView params={params} searchParams={searchParams} />
    </Suspense>
  );
}

function TrackLoading() {
  return (
    <div className="text-text-secondary mx-auto max-w-2xl px-4 py-12 text-center text-lg sm:px-6">
      กำลังโหลดสถานะเคส…
    </div>
  );
}
