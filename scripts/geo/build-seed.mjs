// สร้างไฟล์ seed จังหวัด/อำเภอ/ตำบล (TF-05)
// รันครั้งเดียวตอนอยากอัปเดตข้อมูล: node scripts/geo/build-seed.mjs
// ผลลัพธ์: supabase/seeds/thai_admin_areas.sql (commit ไฟล์นี้ขึ้น git ส่วนไฟล์ต้นฉบับไม่ต้อง)
//
// ขั้นตอน
// 1. โหลดขอบเขตการปกครองไทยจาก HDX/OCHA (~375 MB) เก็บไว้ใน .cache/geo
// 2. ย่อเส้นขอบตำบลด้วย mapshaper ให้คลาดไม่เกิน 50 ม. (ต้นฉบับละเอียดเกินจนไฟล์ใหญ่หลายร้อย MB)
// 3. รวมตำบลเป็นอำเภอและจังหวัด (dissolve) แล้วย่อเพิ่มเพราะใช้แค่แสดงบนแผนที่
// 4. เขียนเป็นคำสั่ง INSERT ให้ supabase db reset โหลดเข้าฐานข้อมูล
//
// ต้องมีคำสั่ง unzip ในเครื่อง (macOS/Linux มีอยู่แล้ว)
// ข้อมูล: OCHA / Royal Thai Survey Department, CC BY-IGO — https://data.humdata.org/dataset/cod-ab-tha

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, createWriteStream } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import mapshaper from "mapshaper";

const SOURCE_URL =
  "https://data.humdata.org/dataset/d24bdc45-eb4c-4e3d-8b16-44db02667c27/resource/10dde461-b781-4904-9559-7deb3e960913/download/tha_admin_boundaries.shp.zip";
const CACHE_DIR = ".cache/geo";
const OUT_FILE = "supabase/seeds/thai_admin_areas.sql";

// ความคลาดสูงสุดของเส้นขอบ (เมตร): ตำบลใช้แปลงพิกัดจึงต้องแม่นกว่า อำเภอ/จังหวัดใช้แสดงผลอย่างเดียว
const SUBDISTRICT_TOLERANCE_M = 50;
const AREA_TOLERANCE_M = 200;
// ทศนิยม 4 ตำแหน่ง ≈ 11 ม. ละเอียดพอเมื่อเทียบกับความคลาด 50 ม. และช่วยให้ไฟล์เล็กลง
const PRECISION = 0.0001;
const BATCH_SIZE = 200;

async function download() {
  mkdirSync(CACHE_DIR, { recursive: true });
  const zipPath = join(CACHE_DIR, "tha_admin_boundaries.shp.zip");
  if (!existsSync(zipPath)) {
    console.log("กำลังโหลดไฟล์ขอบเขตจาก HDX (~375 MB)...");
    const res = await fetch(SOURCE_URL);
    if (!res.ok) throw new Error(`โหลดไม่สำเร็จ: HTTP ${res.status}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(zipPath));
  }
  const shpPath = join(CACHE_DIR, "tha_admin3.shp");
  if (!existsSync(shpPath)) {
    execFileSync("unzip", ["-o", "-q", zipPath, "tha_admin3.*", "-d", CACHE_DIR]);
  }
  return shpPath;
}

async function simplify(shpPath) {
  const out = (name) => join(CACHE_DIR, `${name}.json`);
  const geojson = `format=geojson precision=${PRECISION}`;

  console.log("กำลังย่อเส้นขอบตำบล...");
  await mapshaper.runCommands(
    `-i ${shpPath} -simplify dp interval=${SUBDISTRICT_TOLERANCE_M} keep-shapes ` +
      `-filter-fields adm1_pcode,adm2_pcode,adm3_pcode,adm3_name,adm3_name1 ` +
      `-o ${out("subdistricts")} ${geojson}`,
  );

  // รวมจากตำบลที่ย่อแล้ว เส้นแบ่งอำเภอ/จังหวัดจะตรงกับเส้นแบ่งตำบลพอดี
  console.log("กำลังรวมเป็นอำเภอและจังหวัด...");
  await mapshaper.runCommands(
    `-i ${shpPath} -simplify dp interval=${SUBDISTRICT_TOLERANCE_M} keep-shapes ` +
      `-dissolve adm2_pcode copy-fields=adm1_pcode,adm2_name,adm2_name1 ` +
      `-simplify dp interval=${AREA_TOLERANCE_M} keep-shapes ` +
      `-o ${out("districts")} ${geojson}`,
  );
  await mapshaper.runCommands(
    `-i ${shpPath} -simplify dp interval=${SUBDISTRICT_TOLERANCE_M} keep-shapes ` +
      `-dissolve adm1_pcode copy-fields=adm1_name,adm1_name1 ` +
      `-simplify dp interval=${AREA_TOLERANCE_M} keep-shapes ` +
      `-o ${out("provinces")} ${geojson}`,
  );

  const read = (name) => JSON.parse(readFileSync(out(name), "utf8")).features;
  return {
    provinces: read("provinces"),
    districts: read("districts"),
    subdistricts: read("subdistricts"),
  };
}

// "TH100101" → 100101 (รหัสกรมการปกครอง)
const code = (pcode) => Number(pcode.replace(/^TH/, ""));
const text = (s) => `'${String(s).trim().replaceAll("'", "''")}'`;
// ST_MakeValid กันรูปเพี้ยนจากการย่อ แล้วดึงเฉพาะส่วนที่เป็นพื้นที่ (3 = polygon)
const geom = (g) =>
  `ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(${text(JSON.stringify(g))}), 4326)), 3))`;

function inserts(table, columns, rows) {
  const parts = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const values = rows.slice(i, i + BATCH_SIZE).map((r) => `  (${r.join(", ")})`);
    parts.push(`insert into public.${table} (${columns}) values\n${values.join(",\n")};`);
  }
  return parts.join("\n\n");
}

function toSql({ provinces, districts, subdistricts }) {
  const byCode = (a, b) => a[0] - b[0];
  const p = provinces
    .map(({ properties: x, geometry }) => [
      code(x.adm1_pcode),
      text(x.adm1_name1),
      text(x.adm1_name),
      geom(geometry),
    ])
    .sort(byCode);
  const d = districts
    .map(({ properties: x, geometry }) => [
      code(x.adm2_pcode),
      code(x.adm1_pcode),
      text(x.adm2_name1),
      text(x.adm2_name),
      geom(geometry),
    ])
    .sort(byCode);
  const s = subdistricts
    .map(({ properties: x, geometry }) => [
      code(x.adm3_pcode),
      code(x.adm2_pcode),
      code(x.adm1_pcode),
      text(x.adm3_name1),
      text(x.adm3_name),
      geom(geometry),
    ])
    .sort(byCode);

  return [
    "-- TF-05: จังหวัด/อำเภอ/ตำบล — ไฟล์นี้สร้างอัตโนมัติด้วย scripts/geo/build-seed.mjs ห้ามแก้เอง",
    "-- ข้อมูล: OCHA / Royal Thai Survey Department, CC BY-IGO (https://data.humdata.org/dataset/cod-ab-tha)",
    `-- ${p.length} จังหวัด, ${d.length} อำเภอ, ${s.length} ตำบล`,
    "set search_path = public, extensions;",
    inserts("provinces", "code, name_th, name_en, geom", p),
    inserts("districts", "code, province_code, name_th, name_en, geom", d),
    inserts("subdistricts", "code, district_code, province_code, name_th, name_en, geom", s),
    "",
  ].join("\n\n");
}

const shpPath = await download();
const areas = await simplify(shpPath);
if (areas.provinces.length !== 77) {
  throw new Error(`จังหวัดต้องมี 77 แต่ได้ ${areas.provinces.length}`);
}
mkdirSync("supabase/seeds", { recursive: true });
writeFileSync(OUT_FILE, toSql(areas));
const mb = (readFileSync(OUT_FILE).length / 1e6).toFixed(1);
console.log(
  `เขียน ${OUT_FILE} แล้ว (${mb} MB): ${areas.provinces.length} จังหวัด, ` +
    `${areas.districts.length} อำเภอ, ${areas.subdistricts.length} ตำบล`,
);
