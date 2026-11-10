// ============================================================================
// ตรวจลำดับ migration ใน PR: ไฟล์ที่ PR เพิ่มต้องมี timestamp ใหม่กว่า migration ล่าสุดใน base branch
// เหตุผล: Supabase (db push) ไม่ยอมลง migration ที่เก่ากว่าตัวล่าสุดที่ลงฐานข้อมูลจริงไปแล้ว
//   เคยเกิดกับ TF-27: merge แล้ว Deploy DB ล้มทุกรอบ migration ที่ตามมาไม่ได้ลง dev เลย
// ไฟล์ที่แค่เปลี่ยนชื่อ (เนื้อหาตรงกับ migration ใน base ทุกไบต์) ไม่นับเป็นของใหม่
// ============================================================================

export type MigrationFile = { name: string; blob: string };

export type MigrationOrderResult = {
  latestBase: string | null;
  errors: string[];
  renamed: string[];
};

const STAMP = /^(\d{14})_[a-z0-9_]+\.sql$/;

export function migrationStamp(name: string): string | null {
  return STAMP.exec(name)?.[1] ?? null;
}

export function checkMigrationOrder(
  base: readonly MigrationFile[],
  head: readonly MigrationFile[],
): MigrationOrderResult {
  const baseNames = new Set(base.map((file) => file.name));
  const baseBlobs = new Set(base.map((file) => file.blob));
  const latestBase =
    base
      .map((file) => migrationStamp(file.name))
      .filter((stamp): stamp is string => stamp !== null)
      .sort()
      .at(-1) ?? null;
  const errors: string[] = [];
  const renamed: string[] = [];
  const stamps = new Map<string, string>();

  for (const file of head) {
    const stamp = migrationStamp(file.name);
    if (!stamp) {
      errors.push(`${file.name}: ชื่อไฟล์ต้องเป็น <YYYYMMDDHHMMSS>_<ชื่อตัวเล็ก>.sql`);
      continue;
    }
    const clash = stamps.get(stamp);
    if (clash) errors.push(`${file.name}: timestamp ซ้ำกับ ${clash}`);
    stamps.set(stamp, file.name);

    if (baseNames.has(file.name)) continue;
    if (baseBlobs.has(file.blob)) {
      renamed.push(file.name);
      continue;
    }
    if (latestBase && stamp <= latestBase) {
      errors.push(
        `${file.name}: timestamp ${stamp} ไม่ใหม่กว่า migration ล่าสุดใน base (${latestBase})`,
      );
    }
  }
  return { latestBase, errors, renamed };
}

export const FIX_HINT = [
  "วิธีแก้:",
  "  1. git fetch origin && git rebase origin/develop",
  "  2. เปลี่ยนชื่อไฟล์ migration ของ PR นี้ให้ timestamp ใหม่กว่าไฟล์ล่าสุดใน develop",
  "     เช่น git mv supabase/migrations/<เดิม>.sql supabase/migrations/$(date -u +%Y%m%d%H%M%S)_<ชื่อ>.sql",
  "  3. npm run db:reset && npm run test:db แล้ว push ใหม่",
].join("\n");
