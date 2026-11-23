import type { Metadata } from "next";
import { SurvivalView } from "@/features/survival/SurvivalView";
import { REPORTER_TEXT_TH } from "@/lib/i18n/reporter-text";

export const metadata: Metadata = {
  title: REPORTER_TEXT_TH.survival.metaTitle,
};

export default function SurvivalPage() {
  return <SurvivalView t={REPORTER_TEXT_TH.survival} locale="th" />;
}
