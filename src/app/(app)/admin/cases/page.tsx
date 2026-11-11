import type { Metadata } from "next";
import { Suspense } from "react";
import { SignedInShell } from "@/features/auth/components/SignedInShell";
import { AdminCases } from "@/features/admin/cases/AdminCases";

export const metadata: Metadata = { title: "จัดการเคส — น้ำใจไทย SOS", robots: { index: false } };
export default function Page({ searchParams }: PageProps<"/admin/cases">) {
  return (
    <Suspense fallback={<p>กำลังโหลด…</p>}>
      <SignedInShell
        pathname="/admin/cases"
        title="จัดการเคส"
        wide
        denied={searchParams.then((p) => p.denied === "1")}
      >
        <AdminCases />
      </SignedInShell>
    </Suspense>
  );
}
