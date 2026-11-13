import { locationAccuracyWarning } from "@/lib/domain";

/** ป้ายเตือนพิกัด (GPS ไม่แม่น / พิกัดจาก SMS) ใช้ทั้งหน้ารายการและหน้ารายละเอียดเคส */
export function LocationAccuracyBadge({
  source,
  accuracyM,
}: {
  source: string | null | undefined;
  accuracyM: number | null | undefined;
}) {
  const accuracy = locationAccuracyWarning(source, accuracyM);
  if (!accuracy) return null;
  return (
    <p
      data-testid="accuracy-warning"
      data-level={accuracy.level}
      className={
        accuracy.level === "danger"
          ? "rounded-[12px] border-2 border-red-600 bg-red-50 px-4 py-3 text-base font-bold text-red-600"
          : "rounded-[12px] border border-amber-500/40 bg-amber-50 px-3 py-2 text-base font-semibold text-amber-700"
      }
    >
      {accuracy.text}
    </p>
  );
}
