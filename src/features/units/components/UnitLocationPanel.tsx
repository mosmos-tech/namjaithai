"use client";
import { useEffect, useState } from "react";
import { UnitLocationPicker } from "@/features/units/components/UnitLocationPicker";
type Unit = {
  id: string;
  name: string;
  province: string;
  location_lat: number | null;
  location_lng: number | null;
};
export function UnitLocationPanel() {
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [unitId, setUnitId] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/unit-location", { cache: "no-store", signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json() as Promise<{ units: Unit[] }>;
      })
      .then((data) => {
        setUnits(data.units);
        setUnitId(data.units[0]?.id ?? "");
      })
      .catch(() => {
        if (!controller.signal.aborted) setMessage("โหลดหน่วยไม่สำเร็จ กรุณาลองใหม่");
      });
    return () => controller.abort();
  }, []);
  const unit = units?.find((item) => item.id === unitId);
  async function save(point: { lat: number; lng: number } | null) {
    const response = await fetch("/api/unit-location", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unitId, lat: point?.lat ?? null, lng: point?.lng ?? null }),
    });
    if (!response.ok) return false;
    setUnits(
      (current) =>
        current?.map((item) =>
          item.id === unitId
            ? { ...item, location_lat: point?.lat ?? null, location_lng: point?.lng ?? null }
            : item,
        ) ?? null,
    );
    setMessage(point ? "บันทึกพิกัดหน่วยแล้ว" : "ล้างพิกัดหน่วยแล้ว");
    return true;
  }
  return (
    <section className="mt-6 rounded-xl border bg-white p-5" aria-label="ตั้งพิกัดหน่วย">
      <h2 className="font-heading text-xl font-bold">ตั้งพิกัดที่ตั้งหน่วย</h2>
      {message && <p role="status">{message}</p>}
      {!units ? (
        !message && <p>กำลังโหลด…</p>
      ) : units.length === 0 ? (
        <p>ไม่มีหน่วยที่จัดการได้</p>
      ) : (
        <>
          <label className="block py-3">
            เลือกหน่วย
            <select
              className="ml-2 min-h-12 max-w-full rounded-lg border px-3"
              value={unitId}
              onChange={(e) => {
                setUnitId(e.target.value);
                setMessage("");
              }}
            >
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          {unit && (
            <UnitLocationPicker
              key={unit.id}
              unitId={unit.id}
              unitName={unit.name}
              province={unit.province}
              lat={unit.location_lat}
              lng={unit.location_lng}
              onSave={save}
            />
          )}
        </>
      )}
    </section>
  );
}
