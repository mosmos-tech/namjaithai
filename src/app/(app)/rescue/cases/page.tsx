import type { Metadata } from "next";
import { Suspense } from "react";
import { SignedInShell } from "@/features/auth/components/SignedInShell";
import { requireAccess } from "@/features/auth/server/require-role";
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
  const user = await requireAccess("/rescue/cases");
  return <RescueCaseList capabilities={await getMyUnitCapabilities(user.id)} />;
}
