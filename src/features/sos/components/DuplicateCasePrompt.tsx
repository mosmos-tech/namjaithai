"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, RefreshCw, PlusCircle, Send } from "lucide-react";
import type { DuplicateMatchReason } from "@/lib/domain";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { DuplicateChoice } from "../draft-storage";

export interface DuplicateCasePromptProps {
  matchReason: DuplicateMatchReason;
  options: DuplicateChoice[];
  /** ทางที่กำลังส่งอยู่ (ปุ่มทั้งสองปิดระหว่างส่ง กันกดรัว) */
  pendingAction?: DuplicateChoice | null;
  onSelectAction: (action: DuplicateChoice) => void;
  onCancel?: () => void;
}

/**
 * กล่องถามผู้แจ้งเมื่อระบบพบเคสที่อาจซ้ำ (TF-16 / TF-74)
 * - เบอร์เดียวกันมีคำขอที่ยังเปิดอยู่: "อัปเดตเคสเดิม" หรือ "สร้างเคสใหม่"
 * - มีคนอื่นแจ้งใกล้กันไม่ถึง 50 ม.: เป็นเคสของคนอื่น มีแค่ "ส่งคำขอของฉัน"
 * ไม่แสดงรหัส/ข้อมูลใดๆ ของเคสเดิม (เซิร์ฟเวอร์ไม่ส่งมาด้วย)
 * อยู่ในหน้าฟอร์ม ไม่ใช่หน้าต่างทับ — แถบโทรสายด่วนยังกดได้ตลอด (จึงไม่มี aria-modal)
 */
export function DuplicateCasePrompt({
  matchReason,
  options,
  pendingAction = null,
  onSelectAction,
  onCancel,
}: DuplicateCasePromptProps) {
  const { t } = useI18n();
  const text = t.sos.duplicate;
  const nearby = matchReason === "NEARBY_50M";
  const headingRef = useRef<HTMLHeadingElement>(null);
  const isSubmitting = pendingAction !== null;

  // ย้ายโฟกัสมาที่กล่องเมื่อขึ้น ให้โปรแกรมอ่านหน้าจออ่านคำถามทันทีและมือถือเลื่อนมาเห็น
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const button =
    "font-heading flex min-h-14 w-full items-center justify-center gap-2 rounded-full px-6 text-[19px] font-semibold transition-colors disabled:opacity-60";

  return (
    <section
      aria-labelledby="duplicate-case-prompt-heading"
      data-testid="duplicate-case-prompt"
      data-match={nearby ? "nearby" : "same-phone"}
      className="bg-bg-surface space-y-5 rounded-[14px] border-2 border-amber-500/40 p-5 shadow-sm sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700">
          <AlertTriangle className="size-6" aria-hidden="true" />
        </span>
        <div className="space-y-1">
          <h3
            id="duplicate-case-prompt-heading"
            ref={headingRef}
            tabIndex={-1}
            className="font-heading text-text-primary text-xl font-bold outline-none"
          >
            {nearby ? text.nearbyTitle : text.samePhoneTitle}
          </h3>
          <p className="text-text-secondary text-base leading-relaxed">
            {nearby ? text.nearbyBody : text.samePhoneBody}
          </p>
        </div>
      </div>

      <div className={`grid gap-3 ${options.length > 1 ? "sm:grid-cols-2" : ""}`}>
        {options.includes("UPDATE_EXISTING") && (
          <button
            type="button"
            data-testid="duplicate-update-existing-button"
            disabled={isSubmitting}
            onClick={() => onSelectAction("UPDATE_EXISTING")}
            className={`${button} bg-primary-600 text-text-on-primary hover:bg-primary-700`}
          >
            <RefreshCw className="size-5 shrink-0" aria-hidden="true" />
            <span>{pendingAction === "UPDATE_EXISTING" ? text.sending : text.updateExisting}</span>
          </button>
        )}
        {options.includes("CREATE_NEW") && (
          <button
            type="button"
            data-testid="duplicate-create-new-button"
            disabled={isSubmitting}
            onClick={() => onSelectAction("CREATE_NEW")}
            className={
              nearby
                ? `${button} bg-primary-600 text-text-on-primary hover:bg-primary-700`
                : `${button} border-border-strong bg-bg-surface text-text-primary hover:bg-bg-subtle border-[1.5px]`
            }
          >
            {nearby ? (
              <Send className="size-5 shrink-0" aria-hidden="true" />
            ) : (
              <PlusCircle className="size-5 shrink-0" aria-hidden="true" />
            )}
            <span>
              {pendingAction === "CREATE_NEW"
                ? text.sending
                : nearby
                  ? text.sendMine
                  : text.createNew}
            </span>
          </button>
        )}
      </div>

      {onCancel && (
        <div className="text-center">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onCancel}
            className="text-text-secondary hover:text-text-primary inline-flex min-h-12 items-center px-4 text-base font-medium underline-offset-4 hover:underline"
          >
            {text.back}
          </button>
        </div>
      )}
    </section>
  );
}
