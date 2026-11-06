"use client";

/** Controlled by the list or map, so the same preference can be turned off. */
export function CapabilityFilter({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <label className="flex min-h-12 items-center gap-3">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      แสดงเฉพาะเหตุที่หน่วยช่วยได้
    </label>
  );
}
