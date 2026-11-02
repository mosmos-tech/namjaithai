import { AlertTriangle } from "lucide-react";
import { formatAdminDuplicateNotice } from "@/lib/domain";

export interface PossibleDuplicateNoticeProps {
  duplicateOfCaseCode: string;
  distanceM?: number | null;
  onMergeDuplicate?: () => void;
}

/**
 * กล่องทำเครื่องหมายเคสที่อาจซ้ำให้แอดมินเห็น (TF-16 & TF-31)
 * ดีไซน์ตาม Figma (G2 · Case management · node 13:937 "Possible duplicates"):
 * - พื้นสีเหลืองอำพัน (bg-amber-50) มุมโค้ง 14px
 * - ข้อความสี amber-700 เช่น "อาจซ้ำกับ FL-2610-0040 (ห่าง 30 ม.)"
 * - ปุ่ม "รวมเป็นเคสเดียว" (เมื่อส่ง onMergeDuplicate เข้ามาในหน้าจัดการเคสแอดมิน)
 */
export function PossibleDuplicateNotice({
  duplicateOfCaseCode,
  distanceM,
  onMergeDuplicate,
}: PossibleDuplicateNoticeProps) {
  const noticeText = formatAdminDuplicateNotice(duplicateOfCaseCode, distanceM);

  return (
    <div
      data-testid="admin-possible-duplicate-notice"
      className="bg-amber-50 flex flex-col items-start gap-2 rounded-[14px] px-[14px] py-[12px]"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle
          className="text-amber-700 size-[18px] shrink-0"
          aria-hidden="true"
        />
        <p className="text-amber-700 text-[18px] leading-[1.55] font-semibold">
          {noticeText}
        </p>
      </div>

      {onMergeDuplicate && (
        <button
          type="button"
          data-testid="admin-merge-duplicate-button"
          onClick={onMergeDuplicate}
          className="border-border-strong bg-bg-surface font-heading text-text-primary hover:bg-bg-subtle flex min-h-[52px] items-center justify-center rounded-full border-[1.5px] px-8 py-[14px] text-[19px] leading-[1.2] font-semibold transition-colors"
        >
          รวมเป็นเคสเดียว
        </button>
      )}
    </div>
  );
}
