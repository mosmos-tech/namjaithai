import type { Metadata } from "next";
import { SosWizard } from "@/features/sos/components/SosWizard";
import { REPORTER_TEXT_EN } from "@/lib/i18n/reporter-text.en";

export const metadata: Metadata = {
  title: REPORTER_TEXT_EN.meta.request,
  description: REPORTER_TEXT_EN.meta.requestDescription,
};

export default function EnglishRequestPage() {
  return <SosWizard />;
}
