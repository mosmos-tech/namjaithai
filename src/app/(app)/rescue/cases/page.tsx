import type { Metadata } from "next";
import { Suspense } from "react";
import { SignedInShell } from "@/features/auth/components/SignedInShell";
import { getCurrentAppUser } from "@/features/auth/server/app-user";
import { RescueCaseList } from "@/features/rescue/components/RescueCaseList";
import { getMyUnitCapabilities } from "@/features/rescue/server/my-unit-capabilities";

export const metadata: Metadata = { title: "รายการเคส — น้ำใจไทย SOS", robots: { index: false } };

// TF-23: รายการเคสที่ยังไม่ปิดสำหรับกู้ภัย หัวหน้าหน่วย และแอดมิน
export default function Page({ searchParams }: PageProps<"/rescue/cases">) {
  return (
    <Suspense fallback={<p className="text-text-secondary p-8 text-center text-lg">กำลังโหลด…</p>}>
      <SignedInShell
        pathname="/rescue/cases"
        title="รายการเคส"
        denied={searchParams.then((p) => p.denied === "1")}
      >
        <CaseListWithCapabilities />
      </SignedInShell>
    </Suspense>
  );
}

async function CaseListWithCapabilities() {
  // SignedInShell ตรวจสิทธิ์และ redirect ให้แล้ว — ที่นี่แค่อ่านผู้ใช้ ห้าม redirect ซ้ำกลางการวาดหน้า
  const user = await getCurrentAppUser();
  if (!user) return null;
  return (
    <RescueCaseList capabilities={await getMyUnitCapabilities(user.id)} userRole={user.role} />
  );
}
