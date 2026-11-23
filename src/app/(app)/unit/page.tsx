import { UnitLocationPanel } from "@/features/units/components/UnitLocationPanel";
import { LeadConfirmationQueue } from "@/features/notifications/components/LeadConfirmationQueue";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SignedInShell } from "@/features/auth/components/SignedInShell";
import { UnitInvitePanel } from "@/features/auth/components/UnitInvitePanel";
import { UnitMemberApprovalPanel } from "@/features/auth/components/UnitMemberApprovalPanel";
import { UnitCapabilitiesPanel } from "@/features/auth/components/UnitCapabilitiesPanel";
import { UnitCapabilityAlertNotice } from "@/features/notifications/components/UnitCapabilityAlertNotice";

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
          <Link href="/unit/dashboard" className="inline-flex min-h-12 items-center underline">
            ดูผลงานหน่วย
          </Link>
          <UnitCapabilityAlertNotice />
          <LeadConfirmationQueue />
          <UnitMemberApprovalPanel />
          <UnitCapabilitiesPanel />
          <UnitLocationPanel />
          <UnitInvitePanel />
        </div>
      </SignedInShell>
    </Suspense>
  );
}
