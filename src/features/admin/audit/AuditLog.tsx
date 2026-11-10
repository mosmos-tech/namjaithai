"use client";

import { useEffect, useState, type FormEvent } from "react";

type Log = {
  id: string;
  action: string;
  user_status: "SUSPENDED" | "ACTIVE" | null;
  created_at: string;
  actor_user_id: string | null;
  target_user_id: string | null;
  case_id: string | null;
  actor: { display_name: string } | null;
  target: { display_name: string } | null;
  case: { case_code: string } | null;
};
type Filters = { actor: string; from: string; to: string };
const actions: Record<string, string> = {
  CASE_CONTACT_REVEALED: "เปิดดูข้อมูลติดต่อ",
  MEMBER_APPROVED: "อนุมัติสมาชิก",
  MEMBER_REJECTED: "ปฏิเสธสมาชิก",
  MEMBER_SUSPENDED: "ระงับสมาชิก",
};
const inputClass =
  "min-h-12 w-full rounded-lg border border-slate-400 bg-white px-3 text-slate-900";
export function AuditLog() {
  const [draft, setDraft] = useState<Filters>({ actor: "", from: "", to: "" });
  const [filters, setFilters] = useState<Filters>(draft);
  const [offset, setOffset] = useState(0);
  const [logs, setLogs] = useState<Log[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ ...filters, offset: String(offset) });
        const res = await fetch(`/api/admin/audit?${params}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        setLogs(data.logs);
        setMore(data.hasMore);
      } catch {
        if (!controller.signal.aborted) setError("โหลดบันทึกไม่สำเร็จ กรุณาลองอีกครั้ง");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [filters, offset]);
  function search(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (draft.from && draft.to && draft.from > draft.to) {
      setError("วันเริ่มต้นต้องไม่เกินวันสิ้นสุด");
      return;
    }
    setOffset(0);
    setFilters({ ...draft });
  }
  return (
    <section className="space-y-5" aria-label="รายการบันทึกการตรวจสอบ">
      <form
        onSubmit={search}
        className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3"
      >
        <label className="space-y-1">
          <span>ชื่อผู้ทำรายการ</span>
          <input
            className={inputClass}
            value={draft.actor}
            maxLength={100}
            onChange={(e) => setDraft({ ...draft, actor: e.target.value })}
          />
        </label>
        <label className="space-y-1">
          <span>ตั้งแต่วันที่</span>
          <input
            className={inputClass}
            type="date"
            value={draft.from}
            onChange={(e) => setDraft({ ...draft, from: e.target.value })}
          />
        </label>
        <label className="space-y-1">
          <span>ถึงวันที่</span>
          <input
            className={inputClass}
            type="date"
            value={draft.to}
            onChange={(e) => setDraft({ ...draft, to: e.target.value })}
          />
        </label>
        <button
          className="min-h-12 rounded-lg bg-sky-700 px-5 font-semibold text-white"
          type="submit"
        >
          ค้นหา
        </button>
      </form>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">กำลังโหลด…</p>
      ) : logs.length === 0 ? (
        <p>ไม่พบบันทึก</p>
      ) : (
        <ul className="space-y-3">
          {logs.map((log) => (
            <li key={log.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="font-semibold">
                {log.action === "USER_STATUS_CHANGED"
                  ? log.user_status === "SUSPENDED"
                    ? "ระงับผู้ใช้"
                    : log.user_status === "ACTIVE"
                      ? "เปิดใช้งานผู้ใช้"
                      : "เปลี่ยนสถานะผู้ใช้"
                  : (actions[log.action] ?? log.action)}
              </p>
              <p>
                ผู้ทำรายการ:{" "}
                {log.actor?.display_name ?? (log.actor_user_id ? "ไม่พบชื่อผู้ใช้" : "ระบบ")}
              </p>
              {log.case_id && <p>เคส: {log.case?.case_code ?? "ไม่พบรหัสเคส"}</p>}
              {log.target_user_id && (
                <p>ผู้เกี่ยวข้อง: {log.target?.display_name ?? "ไม่พบชื่อผู้ใช้"}</p>
              )}
              <time dateTime={log.created_at}>
                {new Intl.DateTimeFormat("th-TH", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Asia/Bangkok",
                }).format(new Date(log.created_at))}
              </time>
            </li>
          ))}
        </ul>
      )}
      <nav className="flex gap-3" aria-label="หน้าบันทึก">
        <button
          type="button"
          className="min-h-12 rounded-lg border px-4 disabled:opacity-40"
          disabled={offset === 0 || loading}
          onClick={() => setOffset(Math.max(0, offset - 50))}
        >
          ก่อนหน้า
        </button>
        <button
          type="button"
          className="min-h-12 rounded-lg border px-4 disabled:opacity-40"
          disabled={!more || loading}
          onClick={() => setOffset(offset + 50)}
        >
          ถัดไป
        </button>
      </nav>
    </section>
  );
}
