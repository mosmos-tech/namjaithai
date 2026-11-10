"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type Case = {
  id: string;
  case_code: string;
  status: string;
  urgency: string;
  incident_type: string;
  created_at: string;
  province: string | null;
  district: string | null;
  landmark: string;
  assigned_unit_id: string | null;
  assigned_rescuer_id: string | null;
  duplicate_of_case_id: string | null;
  version: number;
  is_demo: boolean;
};
type Unit = { id: string; name: string; province: string; source: string };
type Contact = {
  name: string | null;
  phone: string | null;
  lineId: string | null;
  address: string | null;
};
type Nearby = { id: string; case_code: string; status: string; distance_m: number };
const urgency: Record<string, string> = { RED: "วิกฤต", YELLOW: "เร่งด่วน", GREEN: "ทั่วไป" };
const status: Record<string, string> = {
  NEW: "รอรับเคส",
  ACCEPTED: "รับเคสแล้ว",
  EN_ROUTE: "กำลังเดินทาง",
  ON_SITE: "ถึงที่เกิดเหตุ",
  AWAITING_CONFIRMATION: "รอยืนยัน",
  RESOLVED: "ช่วยเหลือแล้ว",
  CANCELLED: "ยกเลิก",
  DUPLICATE: "เคสซ้ำ",
  UNREACHABLE: "ติดต่อไม่ได้",
};
const button =
  "min-h-12 rounded-lg border border-slate-300 px-4 py-2 font-semibold disabled:opacity-50";
export function AdminCases() {
  const [closed, setClosed] = useState(false);
  const [filter, setFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const [cases, setCases] = useState<Case[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [selected, setSelected] = useState<Case | null>(null);
  const selectedId = useRef<string | null>(null);
  const [nearby, setNearby] = useState<Nearby[]>([]);
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [unitId, setUnitId] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/admin/cases?closed=${closed ? "1" : "0"}&filter=${encodeURIComponent(filter)}&offset=${offset}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error();
      const data = await response.json();
      setCases(data.cases);
      setUnits(data.units);
    } catch {
      setMessage("โหลดรายการไม่สำเร็จ กรุณาลองใหม่");
    }
  }, [closed, filter, offset]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  async function select(item: Case) {
    selectedId.current = item.id;
    setSelected(item);
    setNearby([]);
    setContacts(null);
    setUnitId("");
    setReason("");
    setMessage("");
    if (closed) return;
    try {
      const response = await fetch(`/api/admin/cases?nearby=${item.id}`);
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (selectedId.current === item.id) setNearby(data.cases);
    } catch {
      setMessage("โหลดเคสใกล้เคียงไม่สำเร็จ");
    }
  }
  async function revealContacts() {
    if (!selected) return;
    try {
      const response = await fetch(`/api/admin/cases?contacts=${selected.id}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (selectedId.current === selected.id) setContacts(data.contacts);
    } catch {
      setMessage("ไม่สามารถแสดงข้อมูลติดต่อได้");
    }
  }
  async function act(payload: Record<string, unknown>) {
    if (!selected || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: selected.id, version: selected.version, ...payload }),
      });
      if (!response.ok)
        throw new Error(
          response.status === 409
            ? "ข้อมูลเคสเปลี่ยนแล้ว กรุณาโหลดใหม่"
            : "ทำรายการไม่สำเร็จ กรุณาตรวจสอบข้อมูลและลองใหม่",
        );
      selectedId.current = null;
      setSelected(null);
      setMessage("บันทึกเรียบร้อยแล้ว");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <Link href="/admin" className="underline">
        ← กลับห้องสั่งการ
      </Link>
      <div className="flex flex-wrap gap-2" aria-label="สถานะเคส">
        <button
          className={button}
          aria-pressed={!closed}
          onClick={() => {
            setClosed(false);
            setOffset(0);
            selectedId.current = null;
            setSelected(null);
          }}
        >
          เปิดอยู่
        </button>
        <button
          className={button}
          aria-pressed={closed}
          onClick={() => {
            setClosed(true);
            setOffset(0);
            selectedId.current = null;
            setSelected(null);
          }}
        >
          ปิดแล้ว
        </button>
      </div>
      <label className="block">
        ตัวกรอง{" "}
        <select
          className="ml-2 min-h-12 rounded-lg border px-3"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setOffset(0);
            selectedId.current = null;
            setSelected(null);
          }}
        >
          <option value="">ทั้งหมด</option>
          <option value="RED">วิกฤต</option>
          <option value="YELLOW">เร่งด่วน</option>
          <option value="GREEN">ทั่วไป</option>
          <option value="UNASSIGNED">ยังไม่มีคนรับ</option>
        </select>
      </label>
      {message && <p role="status">{message}</p>}
      <div className="grid gap-5 md:grid-cols-2">
        <section aria-label="รายการเคส" className="space-y-2">
          <p>เรียงจากเคสเก่าสุด</p>
          {cases.length === 0 && <p>ไม่พบเคส</p>}
          {cases.map((item) => (
            <button
              key={item.id}
              onClick={() => void select(item)}
              className="w-full rounded-xl border p-4 text-left"
              aria-pressed={selected?.id === item.id}
            >
              <strong>{item.case_code}</strong> · {urgency[item.urgency] ?? item.urgency} ·{" "}
              {status[item.status] ?? item.status}
              <br />
              {item.province ?? "ไม่ระบุจังหวัด"} {item.district} ·{" "}
              {new Date(item.created_at).toLocaleString("th-TH")}
            </button>
          ))}
          <div className="flex gap-2">
            <button
              className={button}
              disabled={offset === 0}
              onClick={() => {
                setOffset(Math.max(0, offset - 50));
                selectedId.current = null;
                setSelected(null);
              }}
            >
              ก่อนหน้า
            </button>
            <button
              className={button}
              disabled={cases.length < 50}
              onClick={() => {
                setOffset(offset + 50);
                selectedId.current = null;
                setSelected(null);
              }}
            >
              หน้าถัดไป
            </button>
          </div>
        </section>
        <section aria-label="รายละเอียดเคส" className="space-y-4 rounded-xl border p-4">
          {selected ? (
            <>
              <h2 className="text-xl font-bold">เคส {selected.case_code}</h2>
              <p>
                {selected.landmark} · {selected.incident_type}
              </p>
              <p>สถานะ: {status[selected.status] ?? selected.status}</p>
              <p>
                หน่วย:{" "}
                {units.find((u) => u.id === selected.assigned_unit_id)?.name ?? "ยังไม่มอบหมาย"}
              </p>
              <Link href={`/rescue/cases/${selected.id}`} className="inline-block underline">
                ดูรายละเอียดและประวัติเคส
              </Link>
              <div className="space-y-2">
                <button className={button} onClick={() => void revealContacts()}>
                  แสดงข้อมูลติดต่อ
                </button>
                {contacts?.length === 0 && <p>ไม่มีข้อมูลติดต่อ</p>}
                {contacts?.map((c, i) => (
                  <div key={i} className="rounded-lg border p-3">
                    <p>ชื่อ: {c.name || "ไม่ระบุ"}</p>
                    <p>โทร: {c.phone || "ไม่ระบุ"}</p>
                    <p>LINE: {c.lineId || "ไม่ระบุ"}</p>
                    <p>ที่อยู่: {c.address || "ไม่ระบุ"}</p>
                  </div>
                ))}
              </div>
              {!closed && (
                <>
                  {selected.status === "NEW" && (
                    <div className="space-y-2">
                      <h3 className="font-semibold">มอบหมายหน่วย</h3>
                      <select
                        aria-label="เลือกหน่วย"
                        className="min-h-12 w-full rounded-lg border px-3"
                        value={unitId}
                        onChange={(e) => setUnitId(e.target.value)}
                      >
                        <option value="">เลือกหน่วย</option>
                        {units
                          .filter((u) =>
                            selected.is_demo ? u.source === "DEMO" : u.source !== "DEMO",
                          )
                          .map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name} ({u.province})
                            </option>
                          ))}
                      </select>
                      <button
                        className={button}
                        disabled={!unitId || busy}
                        onClick={() => void act({ action: "assign", unitId })}
                      >
                        มอบหมาย
                      </button>
                    </div>
                  )}
                  <div className="space-y-2">
                    <h3 className="font-semibold">รวมเข้ากับเคสหลักในระยะ 50 เมตร</h3>
                    <p>เคสนี้จะถูกปิดเป็นเคสซ้ำและย้ายข้อมูลติดต่อกับรูปไปยังเคสหลัก</p>
                    {nearby.length === 0 && <p>ไม่พบเคสใกล้เคียง</p>}
                    {nearby.map((other) => (
                      <div key={other.id} className="flex flex-wrap items-center gap-2">
                        <span>
                          {other.case_code} · {Math.round(other.distance_m)} ม.
                        </span>
                        <button
                          className={button}
                          disabled={busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                `รวม ${selected.case_code} เข้ากับ ${other.case_code} ใช่ไหม?`,
                              )
                            )
                              void act({ action: "merge", primaryId: other.id });
                          }}
                        >
                          เลือกเป็นเคสหลัก
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-semibold">ปิดเคส ติดต่อไม่ได้</h3>
                    <label className="block" htmlFor="reason">
                      เหตุผล (อย่างน้อย 3 ตัวอักษร)
                    </label>
                    <textarea
                      id="reason"
                      maxLength={300}
                      className="w-full rounded-lg border p-3"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                    <button
                      className={button}
                      disabled={reason.trim().length < 3 || busy}
                      onClick={() => {
                        if (window.confirm("ยืนยันปิดเคสเป็นติดต่อไม่ได้?"))
                          void act({ action: "unreachable", reason });
                      }}
                    >
                      ปิดเคส
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            <p>เลือกเคสเพื่อดูรายละเอียด</p>
          )}
        </section>
      </div>
    </div>
  );
}
