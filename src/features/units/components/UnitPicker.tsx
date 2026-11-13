"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { groupUnitsByProvince, unitMatchesQuery } from "@/lib/domain";

export type UnitPickerOption = { id: string; label: string; province: string; isDemo: boolean };

// รายการยาวมาก (หน่วย OSM ทั้งประเทศ) วาดแค่ส่วนแรก ที่เหลือให้พิมพ์ค้น
const MAX_SHOWN = 100;

/**
 * ตัวเลือกหน่วย (TF-61 / TF-71) ใช้ร่วมกันใน /units และ /unit/dashboard
 * - ปุ่มแสดงชื่อหน่วยเต็ม ขึ้นบรรทัดใหม่ได้ ไม่ถูกตัดบนจอ 375px (select ของเบราว์เซอร์ตัดชื่อยาว)
 * - กดแล้วเปิดช่องค้นหา + รายการจัดกลุ่มตามจังหวัด (ARIA combobox + listbox)
 * - แป้นพิมพ์: ↑↓ เลื่อน · Enter เลือก · Esc ปิด · Home/End ต้น/ท้ายรายการ
 * - name = ใส่ค่าในฟอร์ม (hidden input) · navigatePrefix = เลือกแล้วไปหน้าของหน่วยนั้น
 */
export function UnitPicker({
  label,
  options,
  value,
  name,
  navigatePrefix,
  placeholder = "เลือกหน่วย",
}: {
  label: string;
  options: UnitPickerOption[];
  value?: string;
  name?: string;
  navigatePrefix?: string;
  placeholder?: string;
}) {
  const router = useRouter();
  const id = useId();
  const [selectedId, setSelectedId] = useState(value ?? "");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const selected = options.find((option) => option.id === selectedId);

  const matches = useMemo(
    () => options.filter((option) => unitMatchesQuery(option.label, query)),
    [options, query],
  );
  const shown = matches.slice(0, MAX_SHOWN);
  const groups = groupUnitsByProvince(shown);
  // ลำดับบนจอ (ตามกลุ่มจังหวัด) ใช้กับลูกศรขึ้นลง
  const flat = groups.flatMap((group) => group.units);
  const positionOf = new Map(flat.map((option, position) => [option.id, position]));
  const optionId = (index: number) => `${id}-option-${index}`;

  function close(restoreFocus: boolean) {
    setOpen(false);
    setQuery("");
    if (restoreFocus) buttonRef.current?.focus();
  }

  function choose(option: UnitPickerOption) {
    setSelectedId(option.id);
    close(true);
    if (navigatePrefix) router.push(`${navigatePrefix}${option.id}`);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const last = flat.length - 1;
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (flat[activeIndex]) choose(flat[activeIndex]);
      return;
    }
    const next =
      event.key === "ArrowDown"
        ? Math.min(last, activeIndex + 1)
        : event.key === "ArrowUp"
          ? Math.max(0, activeIndex - 1)
          : event.key === "Home" && event.ctrlKey
            ? 0
            : event.key === "End" && event.ctrlKey
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    setActiveIndex(next);
    document.getElementById(optionId(next))?.scrollIntoView({ block: "nearest" });
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span id={`${id}-label`} className="text-base font-semibold">
        {label}
      </span>
      {name && <input type="hidden" name={name} value={selectedId} />}
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-value`}
        onClick={() => (open ? close(false) : (setOpen(true), setActiveIndex(0)))}
        className="border-border-default bg-bg-surface flex min-h-12 w-full items-center gap-2 rounded-[12px] border px-3 py-2 text-left text-base"
        data-testid="unit-picker-button"
      >
        <span id={`${id}-value`} className="min-w-0 flex-1 break-words">
          {selected?.label ?? <span className="text-text-secondary">{placeholder}</span>}
        </span>
        <span aria-hidden="true" className="text-text-secondary shrink-0">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <div className="bg-bg-surface flex flex-col gap-2 rounded-[12px] border p-2 shadow-md">
          <input
            autoFocus
            type="search"
            role="combobox"
            aria-expanded="true"
            aria-controls={`${id}-listbox`}
            aria-autocomplete="list"
            aria-activedescendant={flat[activeIndex] ? optionId(activeIndex) : undefined}
            aria-label={`ค้นหา${label}`}
            placeholder="พิมพ์ชื่อหน่วย อำเภอ หรือจังหวัด"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onKeyDown}
            className="border-border-default min-h-12 w-full rounded-[12px] border px-3 text-base"
          />
          <div
            id={`${id}-listbox`}
            role="listbox"
            aria-labelledby={`${id}-label`}
            className="max-h-[60vh] overflow-y-auto overscroll-contain"
          >
            {groups.length === 0 && (
              <p className="text-text-secondary p-3" role="status">
                ไม่พบหน่วยที่ตรงกับคำค้น
              </p>
            )}
            {groups.map((group) => (
              <div key={group.province} role="group" aria-labelledby={`${id}-${group.province}`}>
                <div
                  id={`${id}-${group.province}`}
                  className="bg-bg-surface text-text-secondary sticky top-0 px-3 pt-2 pb-1 text-sm font-semibold"
                >
                  {group.province}
                </div>
                {group.units.map((option) => {
                  const current = positionOf.get(option.id)!;
                  return (
                    <div
                      key={option.id}
                      id={optionId(current)}
                      role="option"
                      aria-selected={option.id === selectedId}
                      onPointerMove={() => setActiveIndex(current)}
                      onClick={() => choose(option)}
                      className={`flex min-h-12 cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 rounded-[10px] px-3 py-2 break-words ${
                        current === activeIndex ? "bg-primary-50 outline-primary-600 outline-2" : ""
                      } ${option.id === selectedId ? "font-semibold" : ""}`}
                    >
                      <span className="min-w-0">{option.label}</span>
                      {option.isDemo && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                          ข้อมูลตัวอย่าง
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
            {matches.length > shown.length && (
              <p className="text-text-secondary p-3 text-sm">
                {`แสดง ${shown.length} จาก ${matches.length} หน่วย พิมพ์ชื่อเพื่อค้นหาเพิ่ม`}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
