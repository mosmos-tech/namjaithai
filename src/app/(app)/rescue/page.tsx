import type { Metadata } from "next";
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
      />
    </Suspense>
  );
}
