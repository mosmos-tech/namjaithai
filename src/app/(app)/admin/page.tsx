import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAccess } from "@/features/auth/server/require-role";
import { AdminManagement } from "@/features/admin/AdminManagement";
import { UnitInvitePanel } from "@/features/auth/components/UnitInvitePanel";
export const metadata: Metadata = {
  title: "จัดการหน่วยและผู้ใช้ — น้ำใจไทย SOS",
  robots: { index: false },
};
async function AdminContent() {
  await requireAccess("/admin");
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="font-heading text-3xl font-bold">จัดการหน่วยและผู้ใช้</h1>
      <p className="text-text-secondary mt-2">สร้างหน่วย แต่งตั้งหัวหน้า และจัดการสิทธิ์ผู้ใช้</p>
      <AdminManagement />
      <UnitInvitePanel />
    </main>
  );
}
export default function Page() {
  return (
    <Suspense fallback={<p className="p-8 text-center">กำลังโหลด…</p>}>
      <AdminContent />
    </Suspense>
  );
}
