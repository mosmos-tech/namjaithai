"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
type Alert = { id: string; case_id: string; case_code: string; kind: "UNCLAIMED" | "TEAM_SILENT" };
export function StaleCaseAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/stale-alerts", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.ok) setAlerts((await response.json()).alerts);
      } catch {
        /* retry on the next poll */
      }
    }
    void load();
    const timer = setInterval(() => void load(), 20_000);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, []);
  if (!alerts.length) return null;
  return (
    <section
      aria-label="แจ้งเตือนเคสค้าง"
      className="rounded-xl border border-amber-400 bg-amber-50 p-4"
    >
      <h2 className="font-heading text-xl font-bold">แจ้งเตือนเคสค้าง</h2>
      <ul>
        {alerts.map((alert) => (
          <li key={alert.id} className="mt-3">
            <p>
              <strong>{alert.case_code}</strong>{" "}
              {alert.kind === "UNCLAIMED"
                ? "ยังไม่มีทีมรับเคส"
                : "ทีมยังไม่ได้อัปเดตเคส กรุณาตรวจสอบและอัปเดตสถานะหรือโน้ต"}
            </p>
            <Link
              href={`/rescue/cases/${alert.case_id}`}
              className="inline-flex min-h-12 items-center underline"
            >
              ดูรายละเอียดเคส
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
