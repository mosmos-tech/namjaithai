import type { Metadata } from "next";
import { Suspense } from "react";
import { SignedInShell } from "@/features/auth/components/SignedInShell";
import { getCurrentAppUser } from "@/features/auth/server/app-user";
import type { MyTask } from "@/features/rescue/components/MyTaskCard";
import { MyTasksView } from "@/features/rescue/components/MyTasksView";
import { createClient } from "@/lib/supabase/server";
import { MY_TASK_STATUSES, type IncomingTransfer } from "@/lib/domain";

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
  // TF-59: คิว "รอรับส่งต่อ" — โหลดไม่สำเร็จไม่ทำให้งานของฉันหาย
  const { data: incoming } = await supabase.rpc("list_incoming_transfers");
  const incomingTransfers = (incoming ?? []) as IncomingTransfer[];
  const { data: cases, error: casesError } = await supabase
    .from("cases")
    .select(
      "id, case_code, status, version, incident_type, urgency, lat, lng, landmark, district, province",
    )
    .eq("assigned_rescuer_id", user.id)
    .eq("is_demo", false)
    .in("status", [...MY_TASK_STATUSES])
    .order("accepted_at", { ascending: true })
    .returns<Omit<MyTask, "notes">[]>();
  if (casesError) {
    return (
      <MyTasksView
        role={user.role}
        tasks={[]}
        loadError
        notesError={false}
        incoming={incomingTransfers}
      />
    );
  }
  const ids = (cases ?? []).map((item) => item.id);
  const { data: notes, error: notesError } = ids.length
    ? await supabase
        .from("case_events")
        .select("case_id, note, created_at")
        .in("case_id", ids)
        .not("note", "is", null)
        .order("created_at", { ascending: false })
        .returns<{ case_id: string; note: string; created_at: string }[]>()
    : { data: [], error: null };
  const tasks: MyTask[] = (cases ?? []).map((item) => ({
    ...item,
    notes: (notes ?? []).filter((note) => note.case_id === item.id).slice(0, 3),
  }));

  return (
    <MyTasksView
      role={user.role}
      tasks={tasks}
      loadError={false}
      notesError={!!notesError}
      incoming={incomingTransfers}
    />
  );
}
