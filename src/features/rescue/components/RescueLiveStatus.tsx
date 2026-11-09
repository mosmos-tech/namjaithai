"use client";

import type { LiveSyncMode, LiveSyncReason } from "../live-sync";

const META: Record<
  Exclude<LiveSyncMode, "off">,
  { dotClass: string; pillClass: string; label: string }
> = {
  realtime: {
    dotClass: "bg-emerald-600",
    pillClass: "border-emerald-200 bg-emerald-50 text-emerald-800",
    label: "อัปเดตเรียลไทม์",
  },
  polling: {
    dotClass: "bg-amber-600",
    pillClass: "border-amber-200 bg-amber-50 text-amber-800",
    label: "อัปเดตทุก 15 วินาที",
  },
  connecting: {
    dotClass: "bg-slate-500",
    pillClass: "border-border-default bg-bg-subtle text-text-secondary",
    label: "กำลังเชื่อมต่อเรียลไทม์…",
  },
};

export function RescueLiveStatus({
  mode,
  reason,
}: {
  mode: LiveSyncMode;
  reason?: LiveSyncReason;
}) {
  if (mode === "off") return null;
  const meta = META[mode];
  const label =
    mode === "polling" && reason === "disabled" ? `${meta.label} (ปิดเรียลไทม์)` : meta.label;

  return (
    <span
      data-testid="rescue-live-status"
      data-live-mode={mode}
      data-live-reason={reason ?? ""}
      role="status"
      aria-live="polite"
      className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium whitespace-nowrap ${meta.pillClass}`}
    >
      <span className={`size-2 shrink-0 rounded-full ${meta.dotClass}`} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
