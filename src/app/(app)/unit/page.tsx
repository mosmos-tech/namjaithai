import type { Metadata } from "next";
import { Suspense } from "react";
import { SignedInShell } from "@/features/auth/components/SignedInShell";
import { UnitInvitePanel } from "@/features/auth/components/UnitInvitePanel";
import { UnitMemberApprovalPanel } from "@/features/auth/components/UnitMemberApprovalPanel";

export const metadata: Metadata = { title: "หน่วยของฉัน — น้ำใจไทย SOS", robots: { index: false } };

export default function Page({ searchParams }: PageProps<"/unit">) {
  return (
    <Suspense fallback={<p className="text-text-secondary p-8 text-center text-lg">กำลังโหลด…</p>}>
      <SignedInShell
        pathname="/unit"
        title="หน่วยของฉัน"
        denied={searchParams.then((p) => p.denied === "1")}
      >
        <div className="mx-auto max-w-3xl px-4 pb-10 sm:px-6">
          <UnitMemberApprovalPanel />
          <UnitInvitePanel />
        </div>
      </SignedInShell>
    </Suspense>
  );
}
