import type { Metadata } from "next";
import { Suspense } from "react";
import { SignedInShell } from "@/features/auth/components/SignedInShell";

export const metadata: Metadata = { title: "เคสของฉัน — น้ำใจไทย SOS", robots: { index: false } };

export default function Page({ searchParams }: PageProps<"/my-cases">) {
  return (
    <Suspense fallback={<p className="text-text-secondary p-8 text-center text-lg">กำลังโหลด…</p>}>
      <SignedInShell
        pathname="/my-cases"
        title="เคสของฉัน"
        comingIn="TF-43"
        denied={searchParams.then((p) => p.denied === "1")}
      />
    </Suspense>
  );
}
