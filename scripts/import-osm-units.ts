// ============================================================================
// TF-60: ดึงจุดหน่วยกู้ภัย/กู้ชีพในไทยจาก OpenStreetMap → data/units-osm.csv ให้คนตรวจทีละแถว
// รัน: npm run db:start แล้ว npm run osm:import (ใช้ฐานข้อมูลในเครื่องหาจังหวัด/อำเภอจากพิกัด)
// - ยิง Overpass API ครั้งเดียว (โดน 429 / เซิร์ฟเวอร์ไม่ว่าง / เน็ตหลุด ค่อยรอแล้วลองใหม่ ไม่เกิน 3 ครั้ง)
// - จังหวัด/อำเภอจาก locate_admin_area() ของ TF-05 ไม่เชื่อ tag addr:* ของ OSM
// - รันซ้ำไม่ทับค่า verified ที่คนแก้ไว้
// ข้อมูล © OpenStreetMap contributors สัญญา ODbL (ดู data/README.md)
// ============================================================================
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  buildOverpassQuery,
  countByProvince,
  dedupeRows,
  elementName,
  elementPoint,
  formatCsv,
  guessOrganization,
  matchReason,
  mergeVerified,
  organizationPhone,
  parseCsv,
  USER_AGENT,
  VERIFIED_NO,
  type OsmElement,
  type UnitRow,
} from "./osm/osm-units.ts";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const CSV_PATH = "data/units-osm.csv";
const MAX_ATTEMPTS = 3;
const LOCATE_CONCURRENCY = 8;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchOverpass(query: string): Promise<OsmElement[]> {
  for (let attempt = 1; ; attempt++) {
    let response: Response | null = null;
    let failure = "";
    try {
      response = await fetch(OVERPASS_URL, {
        method: "POST",
        headers: {
          "User-Agent": USER_AGENT,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(240_000),
      });
      if (response.ok) return ((await response.json()) as { elements: OsmElement[] }).elements;
      failure = `ตอบ ${response.status}`;
    } catch (error) {
      failure = `เชื่อมต่อไม่ได้ (${error instanceof Error ? ((error.cause as Error)?.message ?? error.message) : error})`;
    }
    // เซิร์ฟเวอร์ไม่ว่าง/เน็ตหลุด: รอตาม Retry-After (ไม่มีให้รอ 60, 120 วินาที) แล้วลองใหม่ ไม่ยิงซ้ำถี่
    const busy = !response || [429, 502, 503, 504].includes(response.status);
    if (busy && attempt < MAX_ATTEMPTS) {
      const retryAfter = Number(response?.headers.get("retry-after"));
      const waitS =
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60 * 2 ** (attempt - 1);
      console.warn(`Overpass ${failure} รอ ${waitS} วินาทีแล้วลองใหม่ (ครั้งที่ ${attempt + 1})`);
      await sleep(waitS * 1000);
      continue;
    }
    const detail = response ? (await response.text()).slice(0, 200) : "";
    throw new Error(`Overpass ${failure} ${detail}`.trim());
  }
}

function localDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key)
    throw new Error("ต้องมี NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SECRET_KEY ใน .env.local");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function main() {
  const fetchedAt = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
  console.log("ดึงข้อมูลจาก Overpass API (ครั้งเดียว)…");
  const elements = await fetchOverpass(buildOverpassQuery());
  console.log(`ได้ ${elements.length} จุด`);

  let unnamed = 0;
  const candidates: (UnitRow & { _lat: number; _lng: number })[] = [];
  for (const element of elements) {
    if (element.type === "relation") continue;
    const tags = element.tags ?? {};
    const reason = matchReason(tags);
    const at = elementPoint(element);
    if (!reason || !at) continue;
    const name = elementName(tags);
    if (!name) {
      unnamed++;
      continue;
    }
    candidates.push({
      osm_id: `${element.type}/${element.id}`,
      name,
      organization: guessOrganization(name),
      province: "",
      district: "",
      lat: at.lat.toFixed(6),
      lng: at.lng.toFixed(6),
      phone: organizationPhone(tags),
      fetched_at: fetchedAt,
      match_reason: reason,
      verified: VERIFIED_NO,
      _lat: at.lat,
      _lng: at.lng,
    });
  }

  // จังหวัด/อำเภอจากพิกัด (TF-05) — จุดที่อยู่นอกไทยเกิน 2 กม. ตัดออก
  const db = localDb();
  let outside = 0;
  const located: UnitRow[] = [];
  for (let i = 0; i < candidates.length; i += LOCATE_CONCURRENCY) {
    const batch = candidates.slice(i, i + LOCATE_CONCURRENCY);
    const areas = await Promise.all(
      batch.map((row) => db.rpc("locate_admin_area", { p_lat: row._lat, p_lng: row._lng })),
    );
    batch.forEach(({ _lat, _lng, ...row }, index) => {
      void _lat;
      void _lng;
      const { data, error } = areas[index];
      if (error) throw new Error(`locate_admin_area: ${error.message}`);
      const area = (data as { province_name_th: string; district_name_th: string }[])[0];
      if (!area) {
        outside++;
        return;
      }
      located.push({ ...row, province: area.province_name_th, district: area.district_name_th });
    });
  }

  const deduped = dedupeRows(located);
  const previous = existsSync(CSV_PATH) ? parseCsv(readFileSync(CSV_PATH, "utf8")) : [];
  const { rows, missingVerified } = mergeVerified(previous, deduped);
  mkdirSync("data", { recursive: true });
  writeFileSync(CSV_PATH, formatCsv(rows));

  console.log(
    [
      `เขียน ${CSV_PATH}: ${rows.length} แถว`,
      `  ไม่มีชื่อ (ข้าม): ${unnamed}`,
      `  อยู่นอกประเทศไทย (ข้าม): ${outside}`,
      `  ซ้ำ (ตัดออก): ${located.length - deduped.length}`,
      `  มี tag emergency/rescue: ${rows.filter((row) => row.match_reason !== "name_keyword").length}`,
    ].join("\n"),
  );
  for (const row of missingVerified) {
    console.warn(
      `เตือน: ${row.osm_id} ${row.name} ตรวจแล้วแต่ไม่พบใน OSM รอบนี้ — เก็บไว้ ให้คนตรวจซ้ำ`,
    );
  }
  console.log("\nจำนวนต่อจังหวัด (ทั้งหมด / ตรวจแล้ว):");
  for (const [province, count] of countByProvince(rows)) {
    console.log(`  ${province}: ${count.total} / ${count.verified}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
