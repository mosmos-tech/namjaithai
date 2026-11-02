"use client";

import { useEffect, useState } from "react";

type Unit = { id: string; name: string };
type Invite = {
  id: string;
  unit_id: string;
  token: string;
  max_uses: number;
  used_count: number;
  expires_at: string;
  is_active: boolean;
};

export function UnitInvitePanel() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [unitId, setUnitId] = useState("");
  const [maxUses, setMaxUses] = useState("10");
  const [expiresAt, setExpiresAt] = useState(() => {
    const date = new Date(Date.now() + 7 * 86400000);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [now, setNow] = useState<number | null>(null);

  async function refresh() {
    const response = await fetch("/api/unit-invites", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error("โหลดลิงก์สมัครไม่สำเร็จ");
    setUnits(body.units);
    setInvites(body.invites);
    setUnitId((current) => current || body.units[0]?.id || "");
  }

  useEffect(() => {
    void fetch("/api/unit-invites", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error("โหลดลิงก์สมัครไม่สำเร็จ");
        setUnits(body.units);
        setInvites(body.invites);
        setUnitId(body.units[0]?.id ?? "");
        setNow(Date.now());
      })
      .catch(() => setMessage("โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่"));
  }, []);

  async function createInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/unit-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId, maxUses: Number(maxUses), expiresAt: new Date(expiresAt).toISOString() }),
      });
      if (!response.ok) throw new Error();
      await refresh();
      setMessage("สร้างลิงก์แล้ว คัดลอกไปส่งในกลุ่ม LINE ได้เลย");
    } catch {
      setMessage("สร้างลิงก์ไม่สำเร็จ กรุณาตรวจข้อมูลแล้วลองใหม่");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/unit-invites?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
      await refresh();
      setMessage("ยกเลิกลิงก์แล้ว");
    } catch {
      setMessage("ยกเลิกลิงก์ไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setBusy(false);
    }
  }

  async function copy(token: string) {
    await navigator.clipboard.writeText(`${window.location.origin}/join/${token}`);
    setMessage("คัดลอกลิงก์แล้ว");
  }

  const unitName = (id: string) => units.find((unit) => unit.id === id)?.name ?? "หน่วย";

  return (
    <section className="bg-bg-surface border-border-default mt-6 rounded-2xl border p-5 sm:p-7">
      <div>
        <h2 className="font-heading text-text-primary text-xl font-bold">ลิงก์เชิญกู้ภัยผ่าน LINE</h2>
        <p className="text-text-secondary mt-1">ผู้รับลิงก์ยืนยันตัวตนด้วย LINE ได้ทันที ไม่ต้องกรอกใบสมัคร</p>
      </div>
      {units.length === 0 ? (
        <p className="text-text-secondary mt-5 rounded-xl bg-slate-50 p-4">ยังไม่มีหน่วยที่คุณจัดการได้</p>
      ) : (
        <form onSubmit={createInvite} className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-text-primary flex flex-col gap-2 font-medium">
            หน่วย
            <select className="border-border-strong min-h-12 rounded-lg border bg-white px-3" value={unitId} onChange={(event) => setUnitId(event.target.value)}>
              {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
            </select>
          </label>
          <label className="text-text-primary flex flex-col gap-2 font-medium">
            จำนวนผู้สมัครสูงสุด
            <input className="border-border-strong min-h-12 rounded-lg border bg-white px-3" type="number" min="1" max="500" required value={maxUses} onChange={(event) => setMaxUses(event.target.value)} />
          </label>
          <label className="text-text-primary flex flex-col gap-2 font-medium">
            หมดอายุวันที่และเวลา
            <input className="border-border-strong min-h-12 rounded-lg border bg-white px-3" type="datetime-local" required value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
          </label>
          <div className="flex items-end">
            <button disabled={busy || !unitId} className="font-heading bg-primary-600 min-h-12 w-full rounded-full px-5 font-semibold text-white disabled:opacity-50 sm:w-auto">
              {busy ? "กำลังบันทึก…" : "สร้างลิงก์สมัคร"}
            </button>
          </div>
        </form>
      )}
      {message && <p role="status" className="mt-4 rounded-lg bg-blue-50 px-4 py-3 text-text-primary">{message}</p>}
      {invites.length > 0 && (
        <ul className="mt-5 grid gap-3">
          {invites.map((invite) => {
            const usable = invite.is_active && Date.parse(invite.expires_at) > (now ?? Number.POSITIVE_INFINITY) && invite.used_count < invite.max_uses;
            return (
              <li key={invite.id} className="border-border-default flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-text-primary">{unitName(invite.unit_id)}</p>
                  <p className="text-text-secondary text-sm">ใช้แล้ว {invite.used_count}/{invite.max_uses} · หมดอายุ {new Date(invite.expires_at).toLocaleString("th-TH")}</p>
                  <p className="text-text-secondary mt-1 break-all text-xs">/join/{invite.token}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {usable && <button type="button" onClick={() => void copy(invite.token)} className="border-border-strong min-h-11 rounded-full border px-4 font-semibold text-text-primary">คัดลอก</button>}
                  {invite.is_active && <button type="button" disabled={busy} onClick={() => void revoke(invite.id)} className="min-h-11 rounded-full bg-red-50 px-4 font-semibold text-red-700 disabled:opacity-50">ยกเลิก</button>}
                  {!usable && <span className="self-center text-sm text-text-secondary">ใช้ไม่ได้แล้ว</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
