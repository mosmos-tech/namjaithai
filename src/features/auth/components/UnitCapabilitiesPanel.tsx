"use client";
import { useEffect, useState } from "react";
import { UnitCapability, type UnitCapability as Capability } from "@/lib/domain/incidents";

const names: Record<Capability, string> = {
  BOAT: "เรือ",
  EMS: "การแพทย์ฉุกเฉิน",
  FIRE_SUPPRESSION: "ดับเพลิง",
  EXTRICATION: "ตัดถ่าง",
  WATER_RESCUE: "ช่วยเหลือทางน้ำ",
  ANIMAL_CAPTURE: "จับสัตว์",
  EVACUATION: "อพยพ",
};
type Data = {
  units: { id: string; name: string }[];
  capabilities: { unit_id: string; capability: Capability }[];
};
export function UnitCapabilitiesPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [unit, setUnit] = useState("");
  const [selected, setSelected] = useState<Capability[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/unit-capabilities", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const value = (await res.json()) as Data;
        if (alive) {
          setData(value);
          setUnit(value.units[0]?.id ?? "");
          setSelected(
            value.capabilities
              .filter((item) => item.unit_id === value.units[0]?.id)
              .map((item) => item.capability),
          );
        }
      })
      .catch(() => {
        if (alive) setMessage("โหลดความสามารถไม่สำเร็จ กรุณาลองใหม่");
      });
    return () => {
      alive = false;
    };
  }, []);
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/unit-capabilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId: unit, capabilities: selected }),
      });
      if (!response.ok) throw new Error();
      setData(
        (current) =>
          current && {
            ...current,
            capabilities: [
              ...current.capabilities.filter((item) => item.unit_id !== unit),
              ...selected.map((capability) => ({ unit_id: unit, capability })),
            ],
          },
      );
      setMessage("บันทึกความสามารถแล้ว");
    } catch {
      setMessage("บันทึกไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      aria-labelledby="capability-heading"
      className="border-border-default bg-bg-surface mt-6 rounded-xl border p-5"
    >
      <h2 id="capability-heading" className="font-heading text-xl font-bold">
        ความสามารถของหน่วย
      </h2>
      {message && (
        <p role="status" className="mt-3">
          {message}
        </p>
      )}
      {!data ? (
        <p className="mt-3">กำลังโหลด…</p>
      ) : data.units.length === 0 ? (
        <p className="mt-3">ไม่มีหน่วยที่จัดการได้</p>
      ) : (
        <>
          <label className="mt-4 block">
            หน่วย{" "}
            <select
              aria-label="เลือกหน่วย"
              value={unit}
              onChange={(event) => {
                const next = event.target.value;
                setUnit(next);
                setSelected(
                  data.capabilities
                    .filter((item) => item.unit_id === next)
                    .map((item) => item.capability),
                );
              }}
              className="ml-2 min-h-12 max-w-full rounded-lg border px-3"
            >
              {data.units.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="mt-4 grid gap-2 sm:grid-cols-2">
            <legend>เลือกความสามารถที่หน่วยมี</legend>
            {Object.values(UnitCapability).map((capability) => (
              <label key={capability} className="flex min-h-12 items-center gap-3">
                <input
                  type="checkbox"
                  checked={selected.includes(capability)}
                  onChange={(event) =>
                    setSelected((previous) =>
                      event.target.checked
                        ? [...previous, capability]
                        : previous.filter((item) => item !== capability),
                    )
                  }
                />
                {names[capability]}
              </label>
            ))}
          </fieldset>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="bg-primary-600 mt-4 min-h-12 rounded-full px-6 font-semibold text-white disabled:opacity-50"
          >
            บันทึกความสามารถ
          </button>
        </>
      )}
    </section>
  );
}
