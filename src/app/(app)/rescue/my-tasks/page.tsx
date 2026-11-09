import type { Metadata } from "next";
import { Suspense } from "react";
import { SignedInShell } from "@/features/auth/components/SignedInShell";
import { getCurrentAppUser } from "@/features/auth/server/app-user";
import { MyTasks } from "@/features/rescue/components/MyTasks";

export const metadata: Metadata = { title: "งานของฉัน — น้ำใจไทย SOS", robots: { index: false } };

export default function Page() {
  return (
    <Suspense fallback={<p className="p-8">กำลังโหลด…</p>}>
      <SignedInShell pathname="/rescue/my-tasks" title="งานของฉัน" denied={Promise.resolve(false)}>
        <Tasks />
      </SignedInShell>
    </Suspense>
  );
}

async function Tasks() {
  const user = await getCurrentAppUser();
  return user ? <MyTasks userId={user.id} role={user.role} /> : null;
}
