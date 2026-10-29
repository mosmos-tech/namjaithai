"use client";

import { useSyncExternalStore } from "react";

const ITEMS = [
  { id: "water", label: "น้ำดื่มสำรอง 3 ลิตร/คน/วัน (อย่างน้อย 3 วัน)" },
  { id: "food", label: "อาหารแห้งหรือบรรจุกระป๋อง (อย่างน้อย 3 วัน)" },
  { id: "flashlight", label: "ไฟฉาย พร้อมถ่านสำรอง" },
  { id: "powerbank", label: "แบตสำรอง (power bank) ที่ชาร์จเต็ม" },
  { id: "radio", label: "วิทยุพกพา FM/AM สำหรับฟังประกาศฉุกเฉิน" },
  { id: "medicine", label: "ยาสามัญ + ยาประจำตัว (อย่างน้อย 7 วัน)" },
  { id: "firstaid", label: "ชุดปฐมพยาบาลเบื้องต้น" },
  { id: "documents", label: "สำเนาเอกสารสำคัญ (บัตรประชาชน, ทะเบียนบ้าน, โฉนด)" },
  { id: "clothes", label: "เสื้อผ้า 3 ชุด + รองเท้ากันน้ำหรือรองเท้าบู๊ต" },
  { id: "cash", label: "เงินสดสำรองในถุงพลาสติกกันน้ำ" },
  { id: "whistle", label: "นกหวีดสัญญาณขอความช่วยเหลือ" },
  { id: "gloves", label: "ถุงมือยาง + หน้ากาก N95" },
];

const STORAGE_KEY = "survival-checklist-v1";

// --- Mini localStorage store (module-level singleton) ---
// ใช้ cache ป้องกัน reference instability ที่จะทำให้ useSyncExternalStore loop
let _cachedRaw: string | null = null;
let _cachedSet = new Set<string>();
const _listeners = new Set<() => void>();

function _readSnapshot(): Set<string> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw !== _cachedRaw) {
    _cachedRaw = raw;
    _cachedSet = raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  }
  return _cachedSet;
}

function getSnapshot(): Set<string> {
  try {
    return _readSnapshot();
  } catch {
    return _cachedSet;
  }
}

// Server/hydration snapshot — ต้องตรงกับ server render เพื่อไม่ให้ hydration mismatch
function getServerSnapshot(): Set<string> {
  return _cachedSet; // empty Set (module init)
}

function subscribe(listener: () => void): () => void {
  _listeners.add(listener);
  // รับ storage event จาก tab อื่นด้วย
  window.addEventListener("storage", listener);
  return () => {
    _listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function writeChecked(next: Set<string>): void {
  const raw = JSON.stringify([...next]);
  _cachedRaw = raw;
  _cachedSet = next;
  try {
    localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    // ไม่ทำอะไรถ้า localStorage เขียนไม่ได้
  }
  _listeners.forEach((l) => l());
}

// --- Component ---

export function SurvivalChecklist() {
  const checked = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const done = checked.size;
  const total = ITEMS.length;
  const pct = Math.round((done / total) * 100);

  function toggle(id: string) {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    writeChecked(next);
  }

  return (
    <div className="rounded-[14px] border border-border-default bg-bg-surface p-5 sm:p-6">
      {/* Header + progress */}
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h2 className="font-heading text-xl font-bold text-text-primary">
            เช็กลิสต์ 72 ชั่วโมง
          </h2>
          <p className="mt-0.5 text-sm text-text-secondary">
            {done}/{total} รายการ
          </p>
        </div>
        <span className="font-mono text-2xl font-bold text-primary-600">{pct}%</span>
      </div>

      {/* Progress bar */}
      <div className="mb-5 h-2 overflow-hidden rounded-full bg-border-default">
        <div
          className="h-full rounded-full bg-primary-600 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Items */}
      <ul className="flex flex-col gap-2">
        {ITEMS.map(({ id, label }) => {
          const isChecked = checked.has(id);
          return (
            <li key={id}>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl p-3 transition-colors hover:bg-bg-subtle">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggle(id)}
                  className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-primary-600"
                />
                <span
                  className={`text-base leading-snug transition-colors ${
                    isChecked ? "text-text-secondary line-through" : "text-text-primary"
                  }`}
                >
                  {label}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {done === total && total > 0 && (
        <div className="mt-5 rounded-xl bg-green-50 px-4 py-3 text-center text-sm font-semibold text-green-700">
          พร้อมรับมือแล้ว! ตรวจสอบสิ่งของทุก 6 เดือนเพื่อให้แน่ใจว่ายังใช้งานได้
        </div>
      )}
    </div>
  );
}
