"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
type Item = {
  id: string;
  case_code: string;
  unit_id: string;
  kind: "OVERDUE" | "NOT_RECEIVED";
  created_at: string;
};
export function LeadConfirmationQueue() {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/unit/confirmation-queue", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const data = await response.json();
      setItems(data.items);
    } catch {
      setError("โหลดคิวยืนยันเคสไม่สำเร็จ");
    }
  }, []);
  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 20_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);
  async function act(item: Item) {
    const close = item.kind === "OVERDUE";
    if (close && !window.confirm("ยืนยันปิดเคสนี้โดยไม่ได้รับการยืนยันจากผู้แจ้ง?")) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/unit/confirmation-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: item.id, action: close ? "close" : "acknowledge" }),
      });
      if (!response.ok) throw new Error();
      await load();
    } catch {
      setError("ทำรายการไม่สำเร็จ เคสอาจมีการเปลี่ยนแปลง กรุณาลองใหม่");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="my-4 rounded-[14px] border bg-white p-5" aria-label="คิวยืนยันเคส">
      <h2 className="font-heading text-xl font-bold">คิวยืนยันเคสและแจ้งเตือน</h2>
      {error && <p role="alert">{error}</p>}
      {items.length === 0 && <p className="mt-2">ไม่มีเคสที่ต้องตรวจสอบ</p>}
      <ul className="mt-3 space-y-3">
        {items.map((item) => (
          <li key={`${item.kind}-${item.id}-${item.created_at}`} className="rounded-lg border p-4">
            <p className="font-bold">{item.case_code}</p>
            <p>
              {item.kind === "OVERDUE"
                ? "รอผู้แจ้งยืนยันเกิน 24 ชั่วโมง"
                : "ผู้แจ้งระบุว่ายังไม่ได้รับความช่วยเหลือ เคสกลับไปรอทีมรับ"}
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Link
                className="inline-flex min-h-12 items-center underline"
                href={`/rescue/cases/${item.id}`}
              >
                ดูรายละเอียด
              </Link>
              <button
                disabled={busy}
                className="min-h-12 rounded-full border px-5 font-bold disabled:opacity-50"
                onClick={() => void act(item)}
              >
                {item.kind === "OVERDUE" ? "ปิดโดยไม่ได้รับการยืนยัน" : "รับทราบ"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
