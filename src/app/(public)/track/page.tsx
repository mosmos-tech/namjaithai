import type { Metadata } from "next";
import { TrackLookupPage } from "@/features/sos/components/TrackLookupPage";

export const metadata: Metadata = {
  title: "ติดตามเคส — น้ำใจไทย SOS",
};

export default function TrackPage() {
  return <TrackLookupPage />;
}
