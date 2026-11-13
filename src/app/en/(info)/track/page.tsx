import type { Metadata } from "next";
import { TrackLookupPage } from "@/features/sos/components/TrackLookupPage";
import { REPORTER_TEXT_EN } from "@/lib/i18n/reporter-text.en";

export const metadata: Metadata = {
  title: REPORTER_TEXT_EN.meta.track,
};

export default function EnglishTrackPage() {
  return <TrackLookupPage />;
}
