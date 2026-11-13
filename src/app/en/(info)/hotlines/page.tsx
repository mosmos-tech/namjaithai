import type { Metadata } from "next";
import { HotlinesView } from "@/features/hotlines/HotlinesView";
import { REPORTER_TEXT_EN } from "@/lib/i18n/reporter-text.en";

export const metadata: Metadata = {
  title: REPORTER_TEXT_EN.hotlines.metaTitle,
};

export default function EnglishHotlinesPage() {
  return <HotlinesView t={REPORTER_TEXT_EN.hotlines} locale="en" />;
}
