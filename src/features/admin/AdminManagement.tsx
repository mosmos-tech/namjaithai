"use client";
import { useCallback, useEffect, useState } from "react";
import { userRoleLabel, type UserRole, type UserStatus } from "@/lib/domain/roles";
import { INCIDENT_REGISTRY, UnitCapability, type IncidentType } from "@/lib/domain/incidents";

type User = { id: string; display_name: string; role: UserRole; status: UserStatus };
type Unit = {
  id: string;
  name: string;
  province: string;
  lead_user_id: string | null;
  is_active: boolean;
  source: "DEMO" | "OSM" | "ADMIN";
};
type Data = {
  currentUserId: string;
  users: User[];
  units: Unit[];
  capabilities: { unit_id: string; capability: string }[];
  incidents: { code: IncidentType; is_enabled: boolean }[];
  provinces: { name_th: string }[];
};
const userStatusLabel: Record<UserStatus, string> = {
  ACTIVE: "ใช้งานอยู่",
  PENDING: "รอพิจารณา",
  SUSPENDED: "ถูกระงับ",
  REJECTED: "ไม่อนุมัติ",
};
const labels: Record<string, string> = {
  BOAT: "เรือ",
  EMS: "การแพทย์ฉุกเฉิน",
  FIRE_SUPPRESSION: "ดับเพลิง",
  EXTRICATION: "ตัดถ่าง",
  WATER_RESCUE: "กู้ภัยทางน้ำ",
  ANIMAL_CAPTURE: "จับสัตว์",
  EVACUATION: "อพยพ",
};
const inputClass =
  "border-border-strong min-h-12 w-full min-w-0 rounded-lg border bg-white px-3 text-base";
const buttonClass =
  "font-heading bg-primary-600 inline-flex min-h-12 items-center justify-center rounded-full px-5 font-semibold text-white disabled:opacity-50";
const cardClass = "border-border-default bg-bg-surface rounded-2xl border p-5 sm:p-6";
export function AdminManagement() {
  const [data, setData] = useState<Data | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [unitName, setUnitName] = useState("");
  const [province, setProvince] = useState("");
  const [leader, setLeader] = useState("");
  const [selectedUnit, setSelectedUnit] = useState("");
  const [capEdits, setCapEdits] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    const res = await fetch(`/api/admin/manage?q=${encodeURIComponent(query)}`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error("load failed");
    const next = (await res.json()) as Data;
    setData(next);
    setSelectedUnit((current) =>
      next.units.some((unit) => unit.id === current) ? current : (next.units[0]?.id ?? ""),
    );
    setProvince((current) => current || next.provinces[0]?.name_th || "");
  }, [query]);
  useEffect(() => {
    void Promise.resolve()
      .then(refresh)
      .catch(() => setError("โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่"));
  }, [refresh]);
  const caps =
    capEdits[selectedUnit] ??
    (data?.capabilities ?? [])
      .filter((item) => item.unit_id === selectedUnit)
      .map((item) => item.capability);
  async function send(payload: Record<string, unknown>, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("action failed");
      await refresh();
      setMessage(success);
      return true;
    } catch {
      setError("บันทึกไม่สำเร็จ กรุณาตรวจข้อมูลและลองอีกครั้ง");
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <p role={error ? "alert" : "status"} className="mt-6">
        {error || "กำลังโหลดข้อมูล…"}
      </p>
    );
  const activeUsers = data.users.filter((user) => user.status === "ACTIVE");
  return (
    <div className="mt-6 grid gap-6">
      {message && (
        <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-800">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">
          {error}
        </p>
      )}
      <section aria-labelledby="create-unit" className={cardClass}>
        <h2 id="create-unit" className="font-heading text-xl font-bold">
          สร้างหน่วยและแต่งตั้งหัวหน้า
        </h2>
        <form
          className="mt-4 grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void send(
              { action: "create_unit", name: unitName, province, leaderId: leader },
              "สร้างหน่วยและแต่งตั้งหัวหน้าแล้ว",
            ).then((ok) => {
              if (ok) setUnitName("");
            });
          }}
        >
          <label>
            ชื่อหน่วย
            <input
              className={inputClass}
              required
              maxLength={150}
              value={unitName}
              onChange={(event) => setUnitName(event.target.value)}
            />
          </label>
          <label>
            จังหวัด
            <select
              className={inputClass}
              required
              value={province}
              onChange={(event) => setProvince(event.target.value)}
            >
              {data.provinces.map((item) => (
                <option key={item.name_th}>{item.name_th}</option>
              ))}
            </select>
          </label>
          <label>
            หัวหน้าหน่วย
            <select
              aria-label="หัวหน้าหน่วย"
              className={inputClass}
              required
              value={leader}
              onChange={(event) => setLeader(event.target.value)}
            >
              <option value="">เลือกผู้ใช้ที่ยังใช้งานอยู่</option>
              {activeUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.display_name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button className={buttonClass} disabled={busy}>
              สร้างหน่วย
            </button>
          </div>
        </form>
      </section>
      <section aria-labelledby="users-heading" className={cardClass}>
        <h2 id="users-heading" className="font-heading text-xl font-bold">
          ผู้ใช้และสิทธิ์
        </h2>
        <form
          className="mt-4 flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setQuery(search.trim());
          }}
        >
          <label className="min-w-0 flex-1">
            <span className="sr-only">ค้นหาผู้ใช้</span>
            <input
              className={inputClass}
              placeholder="ค้นหาชื่อผู้ใช้"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <button className={buttonClass}>ค้นหา</button>
        </form>
        <ul aria-label="รายการผู้ใช้" className="mt-4 grid gap-3">
          {data.users.map((user) => (
            <li
              key={user.id}
              className="border-border-default flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
            >
              <div className="min-w-0">
                <p className="font-semibold break-words">{user.display_name}</p>
                <p className="text-text-secondary text-sm">
                  {userRoleLabel[user.role]} · {userStatusLabel[user.status]}
                </p>
              </div>
              <button
                type="button"
                className={buttonClass}
                disabled={busy || user.id === data.currentUserId}
                title={user.id === data.currentUserId ? "ไม่สามารถระงับบัญชีของตัวเอง" : undefined}
                onClick={() =>
                  void send(
                    {
                      action: "user_status",
                      userId: user.id,
                      status: user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE",
                    },
                    user.status === "ACTIVE" ? "ระงับผู้ใช้แล้ว" : "เปิดใช้งานผู้ใช้แล้ว",
                  )
                }
              >
                {user.status === "ACTIVE" ? "ระงับผู้ใช้" : "อนุมัติผู้ใช้"}
              </button>
            </li>
          ))}
        </ul>
        {data.users.length === 0 && <p className="text-text-secondary mt-4">ไม่พบผู้ใช้</p>}
      </section>
      <section aria-labelledby="unit-heading" className={cardClass}>
        <h2 id="unit-heading" className="font-heading text-xl font-bold">
          หัวหน้าและความสามารถหน่วย
        </h2>
        {data.units.length === 0 ? (
          <p className="mt-3">ยังไม่มีหน่วย</p>
        ) : (
          <div className="mt-4 grid gap-4">
            <label>
              เลือกหน่วย
              <select
                aria-label="เลือกหน่วย"
                className={inputClass}
                value={selectedUnit}
                onChange={(event) => setSelectedUnit(event.target.value)}
              >
                {data.units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name} · {unit.province}
                  </option>
                ))}
              </select>
            </label>
            {/* TF-60: หน่วยที่นำเข้าจาก OpenStreetMap ต้องให้เครดิตตามสัญญา ODbL */}
            {data.units.some((unit) => unit.source === "OSM") && (
              <p className="text-text-secondary text-sm">
                ข้อมูลหน่วยบางส่วน ©{" "}
                <a
                  className="underline"
                  href="https://www.openstreetmap.org/copyright"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  OpenStreetMap contributors
                </a>{" "}
                (ODbL)
              </p>
            )}
            <label>
              แต่งตั้งหัวหน้า
              <select
                aria-label="แต่งตั้งหัวหน้า"
                className={inputClass}
                value={leader}
                onChange={(event) => setLeader(event.target.value)}
              >
                <option value="">เลือกผู้ใช้</option>
                {activeUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.display_name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={buttonClass}
              disabled={busy || !leader}
              onClick={() =>
                void send(
                  { action: "assign_leader", unitId: selectedUnit, userId: leader },
                  "แต่งตั้งหัวหน้าแล้ว",
                )
              }
            >
              แต่งตั้งหัวหน้า
            </button>
            <fieldset>
              <legend className="font-semibold">ความสามารถของหน่วย</legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {Object.values(UnitCapability).map((capability) => (
                  <label
                    className="flex min-h-12 items-center gap-3 rounded-lg bg-slate-50 px-3"
                    key={capability}
                  >
                    <input
                      type="checkbox"
                      checked={caps.includes(capability)}
                      onChange={(event) =>
                        setCapEdits((current) => ({
                          ...current,
                          [selectedUnit]: event.target.checked
                            ? [...caps, capability]
                            : caps.filter((item) => item !== capability),
                        }))
                      }
                    />
                    {labels[capability]}
                  </label>
                ))}
              </div>
            </fieldset>
            <button
              type="button"
              className={buttonClass}
              disabled={busy}
              onClick={() =>
                void send(
                  { action: "capabilities", unitId: selectedUnit, capabilities: caps },
                  "บันทึกความสามารถแล้ว",
                )
              }
            >
              บันทึกความสามารถ
            </button>
          </div>
        )}
      </section>
      <section aria-labelledby="incident-heading" className={cardClass}>
        <h2 id="incident-heading" className="font-heading text-xl font-bold">
          ประเภทเหตุที่เปิดรับ
        </h2>
        <ul className="mt-4 grid gap-3">
          {data.incidents.map((incident) => (
            <li
              key={incident.code}
              className="border-border-default flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
            >
              <span>
                {INCIDENT_REGISTRY[incident.code]?.label.th ?? incident.code} ·{" "}
                {incident.is_enabled ? "เปิด" : "ปิด"}
                {incident.code !== "FLOOD" && !incident.is_enabled && " · รอเนื้อหาผ่านการตรวจ"}
              </span>
              <button
                type="button"
                disabled={busy || (incident.code !== "FLOOD" && !incident.is_enabled)}
                className={buttonClass}
                onClick={() =>
                  void send(
                    { action: "incident_type", code: incident.code, enabled: !incident.is_enabled },
                    "เปลี่ยนสถานะประเภทเหตุแล้ว",
                  )
                }
              >
                {incident.is_enabled ? "ปิดรับ" : "เปิดรับ"}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
