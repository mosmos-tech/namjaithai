import type { Metadata } from "next";
import {
  generateUnitProfileMetadata,
  UnitProfileView,
} from "@/features/units/components/UnitProfileView";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  return generateUnitProfileMetadata(params, "en");
}

export default function EnglishUnitPage({ params }: { params: Promise<{ id: string }> }) {
  return <UnitProfileView params={params} locale="en" />;
}
