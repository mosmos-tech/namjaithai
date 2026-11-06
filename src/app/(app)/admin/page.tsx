import type { Metadata } from "next";
import { Suspense } from "react";
import { SignedInShell } from "@/features/auth/components/SignedInShell";
import { AdminManagement } from "@/features/admin/AdminManagement";
import { UnitInvitePanel } from "@/features/auth/components/UnitInvitePanel";

export const metadata: Metadata = { title: "ห้องสั่งการ — น้ำใจไทย SOS", robots: { index: false } };

export default function Page({ searchParams }: PageProps<"/admin">) {
  return (
    <Suspense fallback={<p className="p-8 text-center">กำลังโหลด…</p>}>
      <SignedInShell
        pathname="/admin"
        title="ห้องสั่งการ"
        comingIn="TF-33"
        denied={searchParams.then((p) => p.denied === "1")}
      >
        <AdminManagement />
        <UnitInvitePanel />
      </SignedInShell>
    </Suspense>
  );
}
