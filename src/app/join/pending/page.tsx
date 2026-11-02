import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/features/auth/server/app-user";
import { createAdminClient } from "@/lib/supabase/admin";

export default function JoinPendingPage() {
  return (
    <Suspense fallback={<JoinPendingFallback />}>
      <JoinPendingContent />
    </Suspense>
  );
}

function JoinPendingFallback() {
  return (
    <main className="bg-bg-page flex flex-1 items-center justify-center px-4 py-10">
      <section className="bg-bg-surface border-border-default w-full max-w-xl rounded-2xl border p-6 text-center shadow-sm sm:p-10">
        <p className="text-text-secondary">กำลังตรวจสอบสถานะการสมัคร...</p>
      </section>
    </main>
  );
}

async function JoinPendingContent() {
  const user = await getCurrentAppUser();
  if (!user || user.status !== "ACTIVE") redirect("/login");
  const { data } = await createAdminClient()
    .from("unit_members")
    .select("status, unit:units(name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const unit = data?.unit as unknown as { name: string } | null;
  const statusMessage: Record<string, string> = {
    PENDING: "คำขอเข้าร่วมหน่วยของคุณกำลังรอหัวหน้าหน่วยอนุมัติ",
    APPROVED: "คุณได้รับอนุมัติให้เข้าร่วมหน่วยนี้แล้ว",
    REJECTED: "คำขอเข้าร่วมหน่วยนี้ไม่ได้รับการอนุมัติ กรุณาติดต่อหัวหน้าหน่วย",
    SUSPENDED: "สมาชิกภาพในหน่วยนี้ถูกระงับ กรุณาติดต่อหัวหน้าหน่วย",
  };

  return (
    <main className="bg-bg-page flex flex-1 items-center justify-center px-4 py-10">
      <section className="bg-bg-surface border-border-default w-full max-w-xl rounded-2xl border p-6 text-center shadow-sm sm:p-10">
        <p className="text-5xl" aria-hidden="true">✓</p>
        <h1 className="font-heading text-text-primary mt-4 text-2xl font-bold">ยืนยันตัวตนด้วย LINE แล้ว</h1>
        <p className="text-text-secondary mt-3 text-lg leading-relaxed">
          {unit ? <>หน่วย <strong>{unit.name}</strong></> : "สถานะการสมัครเข้าหน่วย"}
          <br />{data ? statusMessage[data.status] ?? "ตรวจสอบสถานะกับหัวหน้าหน่วย" : "ยังไม่พบสมาชิกภาพของหน่วย"}
        </p>
        <Link href="/" className="font-heading mt-7 inline-flex min-h-12 items-center rounded-full bg-primary-600 px-6 font-semibold text-white hover:brightness-110">
          กลับหน้าแรก
        </Link>
      </section>
    </main>
  );
}
