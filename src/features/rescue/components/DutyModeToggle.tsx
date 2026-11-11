"use client";

import type { UserRole } from "@/lib/domain";
import { useLocationSharing } from "./LocationSharingProvider";

const TIME = new Intl.DateTimeFormat("th-TH", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const ERROR_TEXT = {
  PERMISSION_DENIED:
    "ไม่ได้อนุญาตให้ใช้ตำแหน่ง — เปิดสิทธิ์ตำแหน่งของเว็บนี้ในเบราว์เซอร์แล้วลองใหม่",
  POSITION_UNAVAILABLE: "ยังหาตำแหน่งไม่ได้ ลองออกไปที่โล่งหรือเปิด GPS",
  NOT_ALLOWED: "บัญชีนี้ยังไม่ได้อยู่ในหน่วยกู้ภัย จึงแชร์ตำแหน่งไม่ได้",
} as const;

/**
 * TF-28 สวิตช์ "โหมดปฏิบัติงาน" — แชร์ตำแหน่งให้กู้ภัยในจังหวัดเดียวกันและแอดมินเห็น
 * แสดงเฉพาะกู้ภัย/หัวหน้าหน่วย (แอดมินไม่ได้ออกพื้นที่) บน /rescue/map และ /rescue/my-tasks
 */
export function DutyModeToggle({ role }: { role: UserRole | null | undefined }) {
  const sharing = useLocationSharing();
  if (!sharing || (role !== "RESCUER" && role !== "UNIT_LEAD")) return null;
  const { status, start, stop } = sharing;

  return (
    <section
      aria-label="โหมดปฏิบัติงาน"
      className={`flex flex-col gap-2 rounded-[14px] border p-4 ${
        status.active ? "border-green-300 bg-green-50" : "bg-bg-surface"
      }`}
      data-testid="duty-mode"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-heading text-lg font-semibold">โหมดปฏิบัติงาน</p>
          <p className="text-text-secondary text-sm">
            แชร์ตำแหน่งให้กู้ภัยในจังหวัดเดียวกันเห็นบนแผนที่ ปิดหรือออกจากหน้านี้แล้วหยุดทันที
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={status.active}
          aria-label="แชร์ตำแหน่ง (โหมดปฏิบัติงาน)"
          onClick={() => (status.active ? stop() : start())}
          className={`relative inline-flex h-12 w-20 shrink-0 items-center rounded-full transition-colors ${
            status.active ? "bg-green-600" : "bg-border-strong"
          }`}
        >
          <span
            aria-hidden="true"
            className={`inline-block size-9 rounded-full bg-white shadow transition-transform ${
              status.active ? "translate-x-10" : "translate-x-1.5"
            }`}
          />
        </button>
      </div>

      <p role="status" className="text-sm font-semibold" data-testid="duty-mode-status">
        {status.active
          ? status.lastSentAt
            ? `กำลังแชร์ตำแหน่ง · ส่งล่าสุด ${TIME.format(status.lastSentAt)}`
            : "กำลังหาตำแหน่ง..."
          : "ไม่ได้แชร์ตำแหน่ง"}
      </p>
      {status.active && status.inaccurate && (
        <p className="text-sm text-amber-800">
          ตำแหน่งยังคลาดเคลื่อนเกิน 1 กม. รอให้แม่นขึ้นก่อนส่ง
        </p>
      )}
      {status.active && status.wakeLock === "unsupported" && (
        <p
          role="alert"
          className="rounded-[12px] bg-amber-100 p-3 text-sm font-semibold text-amber-900"
        >
          เครื่องนี้กันจอดับให้ไม่ได้ กรุณาเปิดหน้าจอค้างไว้ระหว่างแชร์ตำแหน่ง (จอดับแล้วจะหยุดส่ง)
        </p>
      )}
      {status.error && (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {ERROR_TEXT[status.error]}
        </p>
      )}
    </section>
  );
}
