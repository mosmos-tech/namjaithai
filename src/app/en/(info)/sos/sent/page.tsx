import type { Metadata } from "next";
import { SentCaseView } from "@/features/sos/components/SentCaseView";
import { REPORTER_TEXT_EN } from "@/lib/i18n/reporter-text.en";

export const metadata: Metadata = {
  title: REPORTER_TEXT_EN.meta.sent,
  robots: { index: false, follow: false },
};

export default function EnglishSentPage() {
  return <SentCaseView />;
}
