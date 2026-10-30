import type { Metadata } from "next";
import { Suspense } from "react";
import { SignedInShell } from "@/features/auth/components/SignedInShell";

export const metadata: Metadata = { title: "ห้องสั่งการ — น้ำใจไทย SOS", robots: { index: false } };

export default function Page({ searchParams }: PageProps<"/admin">) {
  return (
    <Suspense fallback={<p className="text-text-secondary p-8 text-center text-lg">กำลังโหลด…</p>}>
      <SignedInShell
        pathname="/admin"
        title="ห้องสั่งการ"
        comingIn="TF-33"
        denied={searchParams.then((p) => p.denied === "1")}
      />
    </Suspense>
  );
}
