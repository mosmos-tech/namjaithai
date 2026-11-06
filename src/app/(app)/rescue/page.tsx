import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SignedInShell } from "@/features/auth/components/SignedInShell";

export const metadata: Metadata = {
  title: "แผนที่กู้ภัย — น้ำใจไทย SOS",
  robots: { index: false },
};

export default function Page({ searchParams }: PageProps<"/rescue">) {
  return (
    <Suspense fallback={<p className="text-text-secondary p-8 text-center text-lg">กำลังโหลด…</p>}>
      <SignedInShell
        pathname="/rescue"
        title="แผนที่กู้ภัย"
        comingIn="TF-22"
        denied={searchParams.then((p) => p.denied === "1")}
      >
        {/* TF-23: ระหว่างรอแผนที่ (TF-22) ดูเคสแบบรายการได้ก่อน */}
        <Link
          href="/rescue/cases"
          className="bg-primary-600 font-heading inline-flex min-h-12 w-fit items-center rounded-full px-6 text-lg font-semibold text-white"
        >
          ดูรายการเคส
        </Link>
      </SignedInShell>
    </Suspense>
  );
}
