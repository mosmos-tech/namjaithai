"use client";

import { useSyncExternalStore } from "react";
import { format } from "@/lib/i18n/locale";
import { REPORTER_TEXT_TH, type ReporterText } from "@/lib/i18n/reporter-text";
import { useHydrated } from "@/lib/use-hydrated";
import { HydrationPending } from "./HydrationPending";

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

export function SurvivalChecklist({
  t = REPORTER_TEXT_TH.survival.checklist,
}: {
  t?: ReporterText["survival"]["checklist"];
} = {}) {
  const checked = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // TF-68: ติ๊กก่อน hydrate เสร็จ หน้าจอขึ้นว่าติ๊กแล้วแต่ไม่ได้บันทึก (รีโหลดแล้วหาย) จึงปิดไว้จนพร้อม
  const hydrated = useHydrated();

  const done = checked.size;
  const total = t.items.length;
  const pct = Math.round((done / total) * 100);

  function toggle(id: string) {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    writeChecked(next);
  }

  return (
    <div className="border-border-default bg-bg-surface rounded-[14px] border p-5 sm:p-6">
      {/* Header + progress */}
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h2 className="font-heading text-text-primary text-xl font-bold">{t.title}</h2>
          <p className="text-text-secondary mt-0.5 text-sm">
            {format(t.progress, { done, total })}
          </p>
        </div>
        <span className="text-primary-600 font-mono text-2xl font-bold">{pct}%</span>
      </div>

      {/* Progress bar */}
      <div className="bg-border-default mb-5 h-2 overflow-hidden rounded-full">
        <div
          className="bg-primary-600 h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      {!hydrated && (
        <div className="mb-3">
          <HydrationPending />
        </div>
      )}

      {/* Items */}
      <ul className="flex flex-col gap-2">
        {t.items.map(({ id, label }) => {
          const isChecked = checked.has(id);
          return (
            <li key={id}>
              <label className="hover:bg-bg-subtle flex cursor-pointer items-start gap-3 rounded-xl p-3 transition-colors">
                <input
                  type="checkbox"
                  checked={isChecked}
                  disabled={!hydrated}
                  onChange={() => toggle(id)}
                  className="accent-primary-600 mt-0.5 h-5 w-5 shrink-0 cursor-pointer"
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
          {t.readyBanner}
        </div>
      )}
    </div>
  );
}
