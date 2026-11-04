import { TriageReason, triageReasonLabel, Urgency, urgencyLabel } from "../../../lib/domain";

const LEVEL_STYLE: Record<Urgency, { badge: string; dot: string }> = {
  RED: { badge: "bg-red-50 text-red-600 border-red-600/30", dot: "bg-red-600" },
  YELLOW: { badge: "bg-amber-50 text-amber-700 border-amber-500/40", dot: "bg-amber-500" },
  GREEN: { badge: "bg-green-50 text-green-700 border-green-700/30", dot: "bg-green-700" },
};

const KNOWN_REASONS = new Set<string>(Object.values(TriageReason));

export interface TriageTagProps {
  urgency: Urgency;
  /** cases.triage_reasons */
  reasons: readonly string[];
  /** cases.system_urgency — มีค่าเมื่อกู้ภัยปรับระดับแล้ว */
  systemUrgency?: Urgency | null;
  /** cases.urgency_override_reason */
  overrideReason?: string | null;
}

/**
 * แท็กระดับความเร่งด่วน + เหตุผล สำหรับกู้ภัยและแอดมินเท่านั้น (TF-55)
 * ห้ามใช้ในหน้าของผู้แจ้ง — ผู้แจ้งไม่เห็นระดับที่ระบบคำนวณ
 * หน้ารายการเคส/รายละเอียดเคส (TF-23, TF-24) นำไปวาง
 */
export function TriageTag({ urgency, reasons, systemUrgency, overrideReason }: TriageTagProps) {
  const style = LEVEL_STYLE[urgency];
  const overridden = Boolean(systemUrgency && systemUrgency !== urgency);

  return (
    <div className="flex flex-col gap-2" data-testid="triage-tag">
      <span
        className={`font-heading inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-base font-semibold ${style.badge}`}
      >
        <span aria-hidden="true" className={`size-2.5 rounded-full ${style.dot}`} />
        {urgencyLabel[urgency]}
        {overridden && <span className="text-sm font-medium">(กู้ภัยปรับ)</span>}
      </span>

      <ul aria-label="เหตุผลของระดับความเร่งด่วน" className="text-text-secondary text-base">
        {reasons
          .filter((code) => KNOWN_REASONS.has(code))
          .map((code) => (
            <li key={code}>• {triageReasonLabel[code as TriageReason]}</li>
          ))}
      </ul>

      {overridden && systemUrgency && (
        <p className="text-text-secondary text-sm">
          ระบบประเมินไว้ {urgencyLabel[systemUrgency]} · เหตุผลที่ปรับ: {overrideReason}
        </p>
      )}
    </div>
  );
}
