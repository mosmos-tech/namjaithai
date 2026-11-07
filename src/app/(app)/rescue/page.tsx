import type { Metadata } from "next";
import { Suspense } from "react";
import { SignedInShell } from "@/features/auth/components/SignedInShell";
import { requireAccess } from "@/features/auth/server/require-role";
import { RescueMap } from "@/features/rescue/components/RescueMap";
import { getMyUnitCapabilities } from "@/features/rescue/server/my-unit-capabilities";

export const metadata: Metadata = {
  title: "แผนที่กู้ภัย — น้ำใจไทย SOS",
  robots: { index: false },
};

// TF-22: แผนที่กู้ภัย
export default function Page({ searchParams }: PageProps<"/rescue">) {
  return (
    <Suspense fallback={<p className="text-text-secondary p-8 text-center text-lg">กำลังโหลด…</p>}>
      <SignedInShell
        pathname="/rescue"
        title="แผนที่กู้ภัย"
        wide
        denied={searchParams.then((p) => p.denied === "1")}
      >
        <RescueMapWithCapabilities />
      </SignedInShell>
    </Suspense>
  );
}

async function RescueMapWithCapabilities() {
  const user = await requireAccess("/rescue");
  return <RescueMap capabilities={await getMyUnitCapabilities(user.id)} />;
}
