import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";

async function DbStatus() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("health_check")
    .select("message")
    .eq("id", 1)
    .single();

  if (error) {
    return <p className="text-red-600">เชื่อมไม่สำเร็จ: {error.message}</p>;
  }
  return <p className="text-green-700">{data.message}</p>;
}

export default function DbCheckPage() {
  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="mb-4 text-2xl font-bold">ทดสอบการเชื่อมต่อฐานข้อมูล</h1>
      <Suspense fallback={<p>กำลังเชื่อมต่อ…</p>}>
        <DbStatus />
      </Suspense>
    </main>
  );
}
