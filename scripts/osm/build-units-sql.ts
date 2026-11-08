// ============================================================================
// TF-60: แปลงแถวที่ตรวจแล้ว (verified = ใช่) ใน data/units-osm.csv เป็น SQL
//   npm run osm:build-seed       → supabase/seeds/zz_tf60_osm_units.sql (ฐานข้อมูลในเครื่อง/CI)
//   npm run osm:build-migration  → supabase/migrations/<เวลา>_tf60_osm_units_verified.sql (ขึ้น production)
// ทั้งคู่เรียก upsert_osm_units() — upsert ตาม osm_id รันซ้ำได้ผลเหมือนเดิม
// ============================================================================
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseCsv, unitsSql, verifiedPayload } from "./osm-units.ts";

const CSV_PATH = "data/units-osm.csv";
const SEED_PATH = "supabase/seeds/zz_tf60_osm_units.sql";
const MIGRATIONS_DIR = "supabase/migrations";

const mode = process.argv[2];
if (mode !== "seed" && mode !== "migration") {
  console.error("ใช้: node scripts/osm/build-units-sql.ts seed|migration");
  process.exit(1);
}

const { payload, errors } = verifiedPayload(parseCsv(readFileSync(CSV_PATH, "utf8")));
if (errors.length) {
  console.error(`แถวที่ตรวจแล้วมีปัญหา ${errors.length} แถว แก้ใน ${CSV_PATH} ก่อน:`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

if (mode === "seed") {
  writeFileSync(
    SEED_PATH,
    unitsSql(
      payload,
      "-- TF-60: หน่วยกู้ภัยจริงจาก OpenStreetMap สำหรับฐานข้อมูลในเครื่อง (npm run osm:build-seed)",
    ),
  );
  console.log(`เขียน ${SEED_PATH}: ${payload.length} หน่วย`);
} else {
  if (payload.length === 0) {
    console.error(`ยังไม่มีแถว verified = ใช่ ใน ${CSV_PATH} — ไม่สร้าง migration`);
    process.exit(1);
  }
  // ชื่อไฟล์ต้องใหม่กว่า migration ล่าสุด (ไม่งั้น GitHub Actions ลงไม่ได้)
  const now = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const latest = readdirSync(MIGRATIONS_DIR).sort().at(-1)?.slice(0, 14) ?? "";
  const stamp = now > latest ? now : String(Number(latest) + 1);
  const path = `${MIGRATIONS_DIR}/${stamp}_tf60_osm_units_verified.sql`;
  writeFileSync(
    path,
    unitsSql(
      payload,
      "-- TF-60: นำเข้าหน่วยกู้ภัยจริงจาก OpenStreetMap ที่ทีมตรวจแล้ว (npm run osm:build-migration)",
    ),
  );
  console.log(`เขียน ${path}: ${payload.length} หน่วย`);
}
