import type { Metadata } from "next";
import {
  generateUnitProfileMetadata,
  UnitProfileView,
} from "@/features/units/components/UnitProfileView";

export async function generateMetadata({ params }: PageProps<"/units/[id]">): Promise<Metadata> {
  return generateUnitProfileMetadata(params, "th");
}

// TF-61: ผลงานหน่วยต่อสาธารณะ (เปิดได้โดยไม่ล็อกอิน) — ตัวเลขรวมเท่านั้น ไม่มีรายเคส
export default function UnitPage({ params }: PageProps<"/units/[id]">) {
  return <UnitProfileView params={params} locale="th" />;
}
