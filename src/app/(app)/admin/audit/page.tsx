import type { Metadata } from "next";
import { Suspense } from "react";
import { SignedInShell } from "@/features/auth/components/SignedInShell";
import { AuditLog } from "@/features/admin/audit/AuditLog";

export const metadata: Metadata = {
  title: "บันทึกการตรวจสอบ — น้ำใจไทย SOS",
  robots: { index: false },
};
export default function Page({ searchParams }: PageProps<"/admin/audit">) {
  return (
    <Suspense fallback={<p>กำลังโหลด…</p>}>
      <SignedInShell
        pathname="/admin/audit"
        title="บันทึกการตรวจสอบ"
        wide
        denied={searchParams.then((p) => p.denied === "1")}
      >
        <AuditLog />
      </SignedInShell>
    </Suspense>
  );
}
