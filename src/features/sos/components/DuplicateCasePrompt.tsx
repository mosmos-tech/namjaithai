"use client";

import { AlertTriangle, RefreshCw, PlusCircle } from "lucide-react";
import {
  duplicateActionLabels,
  urgencyLabel,
  waterLevelLabel,
  type DuplicateCandidateMatch,
} from "@/lib/domain";

export interface DuplicateCasePromptProps {
  candidate: DuplicateCandidateMatch;
  isSubmitting?: boolean;
  onSelectAction: (action: "UPDATE_EXISTING" | "CREATE_NEW") => void;
  onCancel?: () => void;
}

/**
 * กล่องถามผู้แจ้งเมื่อระบบตรวจพบเคสซ้ำ (TF-16):
 * - เบอร์โทรศัพท์เดียวกันมีเคสที่ยังเปิดอยู่
 * - หรือมีเคสที่ยังเปิดอยู่ห่างไม่ถึง 50 เมตร ภายใน 24 ชั่วโมง
 *
 * มีปุ่มขนาดใหญ่ (>= 48px) 2 ตัวเลือกตามเกณฑ์ผ่าน:
 * 1. "อัปเดตเคสเดิม" (UPDATE_EXISTING)
 * 2. "สร้างใหม่" (CREATE_NEW)
 */
export function DuplicateCasePrompt({
  candidate,
  isSubmitting = false,
  onSelectAction,
  onCancel,
}: DuplicateCasePromptProps) {
  const isSamePhone =
    candidate.matchReason === "SAME_PHONE" || candidate.matchReason === "BOTH";

  const headingText = isSamePhone
    ? "พบเคสที่เปิดอยู่ของเบอร์โทรศัพท์นี้"
    : "พบเคสที่เปิดอยู่ใกล้ตำแหน่งของคุณ";

  const descriptionText = isSamePhone
    ? `เบอร์โทรศัพท์นี้มีคำขอความช่วยเหลือรหัส ${candidate.caseCode} ที่ยังเปิดอยู่ คุณต้องการอัปเดตข้อมูลเข้าเคสเดิม หรือสร้างเคสแยกใหม่?`
    : `มีเคส ${candidate.caseCode} แจ้งไว้ห่างจากจุดนี้ประมาณ ${Math.round(candidate.distanceM)} เมตร (ไม่เกิน 50 ม. ใน 24 ชม. ที่ผ่านมา) เป็นจุดเกิดเหตุเดียวกันที่ต้องการอัปเดตเคสเดิมหรือไม่?`;

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="duplicate-case-prompt-heading"
      data-testid="duplicate-case-prompt"
      className="border-amber-500/40 bg-bg-surface space-y-5 rounded-[14px] border-2 p-5 shadow-sm sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="bg-amber-50 text-amber-700 flex size-11 shrink-0 items-center justify-center rounded-full">
          <AlertTriangle className="size-6" aria-hidden="true" />
        </span>
        <div className="space-y-1">
          <h3
            id="duplicate-case-prompt-heading"
            className="font-heading text-text-primary text-xl font-bold"
          >
            {headingText}
          </h3>
          <p className="text-text-secondary text-base leading-relaxed">
            {descriptionText}
          </p>
        </div>
      </div>

      {/* สรุปข้อมูลเคสเดิมที่พบ */}
      <div className="bg-bg-subtle border-border-default space-y-1.5 rounded-[12px] border p-4 text-base">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-text-secondary">รหัสเคสที่เปิดอยู่</span>
          <strong
            data-testid="duplicate-candidate-code"
            className="text-text-primary font-mono text-lg font-bold"
          >
            {candidate.caseCode}
          </strong>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-text-secondary">ระดับความเร่งด่วน</span>
          <strong className="text-text-primary">
            {urgencyLabel[candidate.urgency]}
            {candidate.waterLevel ? ` · ${waterLevelLabel[candidate.waterLevel]}` : ""}
          </strong>
        </div>
        {typeof candidate.distanceM === "number" && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-text-secondary">ระยะห่างจากจุดที่แจ้ง</span>
            <strong className="text-text-primary font-mono">
              {Math.round(candidate.distanceM)} ม.
            </strong>
          </div>
        )}
      </div>

      {/* ปุ่มตัวเลือก 2 ทางตามเกณฑ์ผ่าน: "อัปเดตเคสเดิม" หรือ "สร้างใหม่" (สูง >= 48px) */}
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          data-testid="duplicate-update-existing-button"
          disabled={isSubmitting}
          onClick={() => onSelectAction("UPDATE_EXISTING")}
          className="bg-primary-600 font-heading text-text-on-primary hover:bg-primary-700 flex min-h-14 w-full items-center justify-center gap-2 rounded-full px-6 text-[19px] font-semibold transition-colors disabled:opacity-60"
        >
          <RefreshCw className="size-5 shrink-0" aria-hidden="true" />
          <span>{duplicateActionLabels.UPDATE_EXISTING}</span>
        </button>

        <button
          type="button"
          data-testid="duplicate-create-new-button"
          disabled={isSubmitting}
          onClick={() => onSelectAction("CREATE_NEW")}
          className="border-border-strong bg-bg-surface font-heading text-text-primary hover:bg-bg-subtle flex min-h-14 w-full items-center justify-center gap-2 rounded-full border-[1.5px] px-6 text-[19px] font-semibold transition-colors disabled:opacity-60"
        >
          <PlusCircle className="size-5 shrink-0" aria-hidden="true" />
          <span>{duplicateActionLabels.CREATE_NEW}</span>
        </button>
      </div>

      {onCancel && (
        <div className="text-center">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onCancel}
            className="text-text-secondary hover:text-text-primary inline-flex min-h-12 items-center px-4 text-base font-medium underline-offset-4 hover:underline"
          >
            กลับไปแก้ไขข้อมูลฟอร์ม
          </button>
        </div>
      )}
    </section>
  );
}
