import type { Metadata } from "next";
import { TrackLookupForm } from "@/features/sos/components/TrackLookupForm";

export const metadata: Metadata = {
  title: "ติดตามเคส — น้ำใจไทย SOS",
};

export default function TrackPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="font-heading text-text-primary text-3xl font-bold">ติดตามเคส</h1>
      <p className="text-text-secondary mt-2 text-lg">
        ใส่รหัสเคสที่ได้ตอนแจ้ง และเบอร์โทร 4 ตัวท้ายที่ใช้แจ้ง
      </p>
      <TrackLookupForm />
    </div>
  );
}
