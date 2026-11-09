import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SignedInShell } from "@/features/auth/components/SignedInShell";
import { getCurrentAppUser } from "@/features/auth/server/app-user";
import { MyTaskCard, type MyTask } from "@/features/rescue/components/MyTaskCard";
import { createClient } from "@/lib/supabase/server";
import { MY_TASK_STATUSES } from "@/lib/domain";

export const metadata: Metadata = { title: "งานของฉัน — น้ำใจไทย SOS", robots: { index: false } };

// TF-26: เคสที่ตัวเองถืออยู่ เลื่อนสถานะทีละขั้นด้วยปุ่มใหญ่ปุ่มเดียว
export default function Page() {
  return (
    <Suspense fallback={<p className="text-text-secondary p-8 text-center text-lg">กำลังโหลด…</p>}>
      <SignedInShell pathname="/rescue/my-tasks" title="งานของฉัน" denied={Promise.resolve(false)}>
        <MyTasks />
      </SignedInShell>
    </Suspense>
  );
}

async function MyTasks() {
  // SignedInShell ตรวจสิทธิ์และ redirect ให้แล้ว — ที่นี่แค่อ่านผู้ใช้ ห้าม redirect ซ้ำกลางการวาดหน้า
  const user = await getCurrentAppUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data: cases } = await supabase
    .from("cases")
    .select(
      "id, case_code, status, version, incident_type, urgency, lat, lng, landmark, district, province",
    )
    .eq("assigned_rescuer_id", user.id)
    .in("status", [...MY_TASK_STATUSES])
    .order("accepted_at", { ascending: true })
    .returns<Omit<MyTask, "notes">[]>();
  const ids = (cases ?? []).map((item) => item.id);
  const { data: notes } = ids.length
    ? await supabase
        .from("case_events")
        .select("case_id, note, created_at")
        .in("case_id", ids)
        .not("note", "is", null)
        .order("created_at", { ascending: false })
        .returns<{ case_id: string; note: string; created_at: string }[]>()
    : { data: [] };
  const tasks: MyTask[] = (cases ?? []).map((item) => ({
    ...item,
    notes: (notes ?? []).filter((note) => note.case_id === item.id).slice(0, 3),
  }));

  return (
    <div className="flex flex-col gap-4">
      {tasks.length === 0 ? (
        <section className="flex flex-col items-start gap-3 rounded-[14px] border p-5">
          <p className="text-lg">ตอนนี้ยังไม่มีเคสที่คุณรับไว้</p>
          <Link
            href="/rescue/cases"
            className="bg-primary-600 text-text-on-primary inline-flex min-h-14 items-center rounded-full px-6 text-lg font-semibold"
          >
            ดูรายการเคสที่รอรับ
          </Link>
        </section>
      ) : (
        tasks.map((task) => <MyTaskCard key={task.id} task={task} />)
      )}
    </div>
  );
}
