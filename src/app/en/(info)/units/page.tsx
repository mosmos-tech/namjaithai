import type { Metadata } from "next";
import { UnitsDirectoryView } from "@/features/units/components/UnitsDirectoryView";
import { REPORTER_TEXT_EN } from "@/lib/i18n/reporter-text.en";

export const metadata: Metadata = {
  title: REPORTER_TEXT_EN.units.metaTitle,
  description: REPORTER_TEXT_EN.units.metaDescription,
};

export default function EnglishUnitsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <UnitsDirectoryView searchParams={searchParams} locale="en" />;
}
