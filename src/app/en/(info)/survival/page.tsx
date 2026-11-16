import type { Metadata } from "next";
import { SurvivalView } from "@/features/survival/SurvivalView";
import { REPORTER_TEXT_EN } from "@/lib/i18n/reporter-text.en";

export const metadata: Metadata = {
  title: REPORTER_TEXT_EN.survival.metaTitle,
};

export default function EnglishSurvivalPage() {
  return <SurvivalView t={REPORTER_TEXT_EN.survival} locale="en" />;
}
