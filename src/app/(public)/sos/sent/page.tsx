import type { Metadata } from "next";
import { SentCaseView } from "@/features/sos/components/SentCaseView";

export const metadata: Metadata = {
  title: "ส่งคำขอแล้ว — น้ำใจไทย SOS",
  // หน้าเฉพาะตัวผู้แจ้ง ไม่ให้ search engine เก็บ
  robots: { index: false, follow: false },
};

export default function SentPage() {
  return <SentCaseView />;
}
