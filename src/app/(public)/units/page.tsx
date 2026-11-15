import type { Metadata } from "next";
import { UnitsDirectoryView } from "@/features/units/components/UnitsDirectoryView";
import { REPORTER_TEXT_TH } from "@/lib/i18n/reporter-text";

export const metadata: Metadata = {
  title: REPORTER_TEXT_TH.units.metaTitle,
  description: REPORTER_TEXT_TH.units.metaDescription,
};

// TF-61: หน้าสาธารณะ เลือกหน่วยกู้ภัย (เปิดได้โดยไม่ล็อกอิน)
export default function UnitsPage({ searchParams }: PageProps<"/units">) {
  return <UnitsDirectoryView searchParams={searchParams} locale="th" />;
}
