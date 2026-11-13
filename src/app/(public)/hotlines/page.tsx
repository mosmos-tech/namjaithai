import type { Metadata } from "next";
import { HotlinesView } from "@/features/hotlines/HotlinesView";
import { REPORTER_TEXT_TH } from "@/lib/i18n/reporter-text";

export const metadata: Metadata = {
  title: REPORTER_TEXT_TH.hotlines.metaTitle,
};

export default function HotlinesPage() {
  return <HotlinesView t={REPORTER_TEXT_TH.hotlines} locale="th" />;
}
