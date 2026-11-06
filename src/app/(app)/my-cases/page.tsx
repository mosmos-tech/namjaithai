import type { Metadata } from "next";
import { Suspense } from "react";
import { MyCases } from "@/features/my-cases/MyCases";

export const metadata: Metadata = { title: "เคสของฉัน — น้ำใจไทย SOS", robots: { index: false } };

export default function Page({ searchParams }: PageProps<"/my-cases">) {
  return (
    <Suspense fallback={<p className="text-text-secondary p-8 text-center text-lg">กำลังโหลด…</p>}>
      <MyCases searchParams={searchParams} />
    </Suspense>
  );
}
