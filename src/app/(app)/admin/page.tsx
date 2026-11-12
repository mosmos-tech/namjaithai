import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { SignedInShell } from "@/features/auth/components/SignedInShell";
import { AdminManagement } from "@/features/admin/AdminManagement";
import { UnitInvitePanel } from "@/features/auth/components/UnitInvitePanel";
import { LineDeliveryNotice } from "@/features/notifications/components/LineDeliveryNotice";
import { LeadConfirmationQueue } from "@/features/notifications/components/LeadConfirmationQueue";
import { PerformanceReviewQueue } from "@/features/unit-stats/components/PerformanceReviewQueue";
import { AdminStats } from "@/features/admin/stats/AdminStats";

export const metadata: Metadata = { title: "ห้องสั่งการ — น้ำใจไทย SOS", robots: { index: false } };

export default function Page({ searchParams }: PageProps<"/admin">) {
  return (
    <Suspense fallback={<p className="p-8 text-center">กำลังโหลด…</p>}>
      <SignedInShell
        pathname="/admin"
        title="ห้องสั่งการ"
        denied={searchParams.then((p) => p.denied === "1")}
      >
        <AdminStats searchParams={searchParams} />
        <Link href="/admin/cases" className="inline-flex min-h-12 items-center underline">
          จัดการเคส
        </Link>
        <Link href="/admin/audit" className="inline-flex min-h-12 items-center underline">
          บันทึกการตรวจสอบ
        </Link>
        <LineDeliveryNotice />
        <LeadConfirmationQueue />
        <PerformanceReviewQueue />
        <Link href="/unit/dashboard" className="inline-flex min-h-12 items-center underline">
          ผลงานหน่วย
        </Link>
        <AdminManagement />
        <UnitInvitePanel />
      </SignedInShell>
    </Suspense>
  );
}
