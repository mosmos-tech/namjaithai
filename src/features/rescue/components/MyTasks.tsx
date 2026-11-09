"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { openCaseStatusLabel, type CaseStatus, type UserRole } from "@/lib/domain";
import { createClient } from "@/lib/supabase/client";
import { useRescueCasesLive } from "../use-rescue-cases-live";

type Task = {
  id: string;
  case_code: string;
  status: CaseStatus;
  landmark: string;
  province: string | null;
};

export function MyTasks({ userId, role }: { userId: string; role: UserRole }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const requestSequence = useRef(0);
  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    const { data, error: loadError } = await createClient()
      .from("cases")
      .select("id, case_code, status, landmark, province")
      .eq("assigned_rescuer_id", userId)
      .in("status", ["ACCEPTED", "EN_ROUTE", "ON_SITE"])
      .order("created_at", { ascending: false });
    if (sequence !== requestSequence.current) return false;
    if (loadError) {
      setError(true);
      setLoading(false);
      return false;
    }
    setTasks((data ?? []) as Task[]);
    setError(false);
    setLoading(false);
    return true;
  }, [userId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- โหลดรายการจากฐานข้อมูลเมื่อเปลี่ยนผู้ใช้
    void load();
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- invalidate any response still in flight
      requestSequence.current++;
    };
  }, [load]);
  useRescueCasesLive({ role, onRefresh: load, catchUpOnFirstSubscribe: true });
  return (
    <section aria-label="เคสที่ได้รับมอบหมาย" className="flex flex-col gap-4">
      {loading && <p>กำลังโหลดงาน…</p>}
      {error && (
        <p role="alert">
          โหลดงานไม่สำเร็จ กรุณาลองใหม่{" "}
          <button type="button" className="underline" onClick={() => void load()}>
            ลองอีกครั้ง
          </button>
        </p>
      )}
      {!loading && !error && tasks.length === 0 && <p>ยังไม่มีเคสที่ได้รับมอบหมาย</p>}
      <ul className="flex flex-col gap-3">
        {tasks.map((task) => (
          <li key={task.id}>
            <Link
              href={`/rescue/cases/${task.id}`}
              className="border-border-default block min-h-12 rounded-xl border p-4"
            >
              <strong className="font-mono">{task.case_code}</strong>
              <span className="ml-3">{openCaseStatusLabel[task.status]}</span>
              <p>{[task.landmark, task.province].filter(Boolean).join(" · ")}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
