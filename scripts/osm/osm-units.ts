// ============================================================================
// TF-60: กติกากลางของการนำเข้าหน่วยกู้ภัยจาก OpenStreetMap
// ใช้ร่วมกันโดย scripts/import-osm-units.ts (ดึง → CSV) และ scripts/osm/build-units-sql.ts
// (CSV ที่ตรวจแล้ว → seed / migration) — ไม่มีการเรียกเน็ตหรือฐานข้อมูลในไฟล์นี้ จึงเขียน unit test ได้
// ข้อมูล © OpenStreetMap contributors สัญญา ODbL (ดู data/README.md)
// ============================================================================

export type MatchReason = "ambulance_station" | "rescue_station" | "name_keyword";

export type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

/** หนึ่งแถวใน data/units-osm.csv */
export type UnitRow = {
  osm_id: string;
  name: string;
  organization: string;
  province: string;
  district: string;
  lat: string;
  lng: string;
  phone: string;
  fetched_at: string;
  match_reason: MatchReason;
  verified: string;
};

export const CSV_COLUMNS: readonly (keyof UnitRow)[] = [
  "osm_id",
  "name",
  "organization",
  "province",
  "district",
  "lat",
  "lng",
  "phone",
  "fetched_at",
  "match_reason",
  "verified",
];

export const VERIFIED_YES = "ใช่";
export const VERIFIED_NO = "ไม่";

export const USER_AGENT =
  "namjaithai-sos-osm-import/1.0 (+https://github.com/mosmos-tech/namjaithai)";

export const NAME_KEYWORDS = [
  "มูลนิธิ",
  "กู้ภัย",
  "กู้ชีพ",
  "ร่วมกตัญญู",
  "ป่อเต็กตึ๊ง",
  "ปอเต็กตึ๊ง",
];

/** query เดียวทั้งประเทศ: node + way (way ใช้จุดกลางจาก out center) */
export function buildOverpassQuery(): string {
  const names = NAME_KEYWORDS.join("|");
  const selectors = [
    '["emergency"="ambulance_station"]',
    '["amenity"="rescue_station"]',
    `["office"]["name"~"${names}"]`,
    `["amenity"]["name"~"${names}"]`,
  ];
  return [
    "[out:json][timeout:180];",
    'area["ISO3166-1"="TH"][admin_level=2]->.th;',
    "(",
    ...selectors.flatMap((selector) => [
      `  node${selector}(area.th);`,
      `  way${selector}(area.th);`,
    ]),
    ");",
    "out center tags;",
  ].join("\n");
}

// ── องค์กรจากชื่อ ─────────────────────────────────────────────────────────────
/**
 * ตาราง alias ที่เดียวของโปรเจกต์: ชื่อที่พบใน OSM → ชื่อองค์กรจริง
 * สร้าง organizations จริง (is_demo = false) ได้เฉพาะชื่อในตารางนี้ — เพิ่มองค์กรต้องเพิ่มที่นี่พร้อม test
 */
export const ORGANIZATION_ALIASES: readonly { organization: string; aliases: readonly string[] }[] =
  [
    {
      organization: "มูลนิธิป่อเต็กตึ๊ง",
      aliases: [
        "ป่อเต็กตึ๊ง",
        "ปอเต็กตึ๊ง",
        "ป่อเต็กตึ้ง",
        "ปอเต็กตึ้ง",
        "poh teck tung",
        "pohtecktung",
      ],
    },
    {
      organization: "มูลนิธิร่วมกตัญญู",
      aliases: ["ร่วมกตัญญู", "ruamkatanyu", "ruam katanyu"],
    },
  ];

export const KNOWN_ORGANIZATIONS: ReadonlySet<string> = new Set(
  ORGANIZATION_ALIASES.map((entry) => entry.organization),
);

function compact(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\s​.\-()]/g, "");
}

/** เดาองค์กรจากชื่อจุด — ไม่ตรงตาราง alias = ว่าง (ไม่เดาเอง) */
export function guessOrganization(name: string): string {
  const text = compact(name);
  const hit = ORGANIZATION_ALIASES.find((entry) =>
    entry.aliases.some((alias) => text.includes(compact(alias))),
  );
  return hit?.organization ?? "";
}

// ── จัดประเภท / พิกัด / ชื่อ ────────────────────────────────────────────────
export function matchReason(tags: Record<string, string>): MatchReason | null {
  if (tags.emergency === "ambulance_station") return "ambulance_station";
  if (tags.amenity === "rescue_station") return "rescue_station";
  const name = elementName(tags);
  if ((tags.office || tags.amenity) && NAME_KEYWORDS.some((keyword) => name.includes(keyword))) {
    return "name_keyword";
  }
  return null;
}

/** ชื่อจุด — ใช้แค่ tag name (ไม่ใช้ operator / contact:name ที่อาจเป็นชื่อบุคคล) */
export function elementName(tags: Record<string, string>): string {
  return (tags.name ?? tags["name:th"] ?? tags["name:en"] ?? "").replace(/\s+/g, " ").trim();
}

export function elementPoint(element: OsmElement): { lat: number; lng: number } | null {
  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;
  return typeof lat === "number" && typeof lng === "number" ? { lat, lng } : null;
}

// ── เบอร์องค์กร ─────────────────────────────────────────────────────────────
/**
 * เก็บเฉพาะ tag phone / contact:phone ของจุดนั้น และเฉพาะเบอร์ที่เป็นเบอร์องค์กร:
 * สายด่วน 4 หลัก (1xxx) หรือเบอร์บ้าน/สำนักงาน 02–07 · ไม่เก็บมือถือ 06/08/09 (มักเป็นเบอร์ส่วนตัว)
 */
export function organizationPhone(tags: Record<string, string>): string {
  const raw = [tags.phone, tags["contact:phone"]].filter(Boolean).join(";");
  for (const part of raw.split(/[;,/]/)) {
    let digits = part.replace(/[^\d+]/g, "");
    if (digits.startsWith("+66")) digits = `0${digits.slice(3)}`;
    else if (digits.startsWith("66") && digits.length === 11) digits = `0${digits.slice(2)}`;
    if (/^1\d{3}$/.test(digits) || /^0[2-7]\d{7}$/.test(digits)) return digits;
  }
  return "";
}

// ── ตัดแถวซ้ำ / เรียง / รวมค่า verified เดิม ─────────────────────────────────
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

const point = (row: UnitRow) => ({ lat: Number(row.lat), lng: Number(row.lng) });

// แถวที่น่าเชื่อถือกว่า: มี tag emergency/rescue ก่อนแถวที่เจอจากคำในชื่อ แล้วแถวที่มีเบอร์
function rank(row: UnitRow): number {
  return (row.match_reason === "name_keyword" ? 2 : 0) + (row.phone ? 0 : 1);
}

/** ตัด osm_id ซ้ำ และชื่อเดียวกัน (ไม่สนช่องว่าง/ตัวพิมพ์) ที่ห่างกันไม่เกิน 100 ม. */
export function dedupeRows(rows: readonly UnitRow[], radiusM = 100): UnitRow[] {
  const kept: UnitRow[] = [];
  for (const row of [...rows].sort((a, b) => rank(a) - rank(b))) {
    const duplicate = kept.some(
      (other) =>
        other.osm_id === row.osm_id ||
        (compact(other.name) === compact(row.name) &&
          distanceM(point(other), point(row)) <= radiusM),
    );
    if (!duplicate) kept.push(row);
  }
  return kept;
}

/** แถวที่มี tag emergency/rescue ขึ้นก่อน (ตรวจกลุ่มที่น่าเชื่อถือก่อน) แล้วเรียงจังหวัด อำเภอ ชื่อ */
export function sortRows(rows: readonly UnitRow[]): UnitRow[] {
  const thai = (a: string, b: string) => a.localeCompare(b, "th");
  return [...rows].sort(
    (a, b) =>
      Number(a.match_reason === "name_keyword") - Number(b.match_reason === "name_keyword") ||
      thai(a.province, b.province) ||
      thai(a.district, b.district) ||
      thai(a.name, b.name) ||
      thai(a.osm_id, b.osm_id),
  );
}

/**
 * รันซ้ำไม่ทับค่า verified ที่คนแก้ไว้: แถวเดิมใช้ verified เดิม แถวใหม่ = "ไม่"
 * แถวที่ตรวจว่า "ใช่" แล้วแต่หายจาก OSM เก็บไว้ (คืนใน missingVerified ให้สคริปต์เตือน)
 */
export function mergeVerified(previous: readonly UnitRow[], next: readonly UnitRow[]) {
  const before = new Map(previous.map((row) => [row.osm_id, row]));
  const nextIds = new Set(next.map((row) => row.osm_id));
  const missingVerified = previous.filter(
    (row) => row.verified === VERIFIED_YES && !nextIds.has(row.osm_id),
  );
  const rows = [
    ...next.map((row) => ({ ...row, verified: before.get(row.osm_id)?.verified || VERIFIED_NO })),
    ...missingVerified,
  ];
  return { rows: sortRows(rows), missingVerified };
}

// ── CSV ─────────────────────────────────────────────────────────────────────
function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function formatCsv(rows: readonly UnitRow[]): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const row of rows) lines.push(CSV_COLUMNS.map((column) => csvField(row[column])).join(","));
  return `${lines.join("\n")}\n`;
}

export function parseCsv(text: string): UnitRow[] {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      record.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      if (record.some((value) => value !== "")) records.push(record);
      record = [];
      field = "";
    } else field += char;
  }
  record.push(field);
  if (record.some((value) => value !== "")) records.push(record);

  const [header, ...body] = records;
  if (!header) return [];
  const missing = CSV_COLUMNS.filter((column) => !header.includes(column));
  if (missing.length) throw new Error(`CSV ขาดคอลัมน์: ${missing.join(", ")}`);
  return body.map((values) => {
    const row = Object.fromEntries(
      CSV_COLUMNS.map((column) => [column, (values[header.indexOf(column)] ?? "").trim()]),
    );
    return row as UnitRow;
  });
}

// ── แถวที่ตรวจแล้ว → ข้อมูลส่งเข้า upsert_osm_units() ──────────────────────────
export type OsmUnitPayload = {
  osm_id: string;
  name: string;
  organization: string | null;
  province: string;
  district: string | null;
  phone: string | null;
};

/** เฉพาะ verified = "ใช่" · ตรวจความถูกต้องก่อนเข้าฐานข้อมูล คืนรายการผิดให้คนแก้ CSV */
export function verifiedPayload(rows: readonly UnitRow[]) {
  const errors: string[] = [];
  const payload: OsmUnitPayload[] = [];
  const seenIds = new Set<string>();
  const seenBranches = new Set<string>();
  for (const row of rows) {
    if (row.verified !== VERIFIED_YES) continue;
    const where = `${row.osm_id || "(ไม่มี osm_id)"} ${row.name}`;
    if (!/^(node|way)\/\d+$/.test(row.osm_id)) errors.push(`${where}: osm_id ไม่ถูกต้อง`);
    if (seenIds.has(row.osm_id)) errors.push(`${where}: osm_id ซ้ำ`);
    if (!row.name) errors.push(`${where}: ไม่มีชื่อ`);
    if (!row.province) errors.push(`${where}: ไม่มีจังหวัด`);
    if (row.organization && !KNOWN_ORGANIZATIONS.has(row.organization)) {
      errors.push(
        `${where}: องค์กร "${row.organization}" ไม่อยู่ในตาราง alias (scripts/osm/osm-units.ts)`,
      );
    }
    if (row.phone && row.phone !== organizationPhone({ phone: row.phone })) {
      errors.push(`${where}: เบอร์ต้องเป็นสายด่วน 4 หลักหรือเบอร์สำนักงาน (ห้ามเบอร์มือถือ)`);
    }
    // index ของ TF-56: องค์กร + จังหวัด + อำเภอ + สาขา ห้ามซ้ำ
    const branch = [row.organization, row.province, row.district, row.name].join("|");
    if (row.organization && seenBranches.has(branch)) {
      errors.push(
        `${where}: องค์กร/อำเภอ/ชื่อซ้ำกับแถวอื่น แก้ชื่อให้ต่างกันหรือตั้งแถวหนึ่งเป็น "ไม่"`,
      );
    }
    seenIds.add(row.osm_id);
    seenBranches.add(branch);
    payload.push({
      osm_id: row.osm_id,
      name: row.name,
      organization: row.organization || null,
      province: row.province,
      district: row.district || null,
      phone: row.phone || null,
    });
  }
  return { payload, errors };
}

/** SQL ที่เรียก upsert_osm_units() — ใช้ทั้ง seed และ migration (รันซ้ำได้ผลเหมือนเดิม) */
export function unitsSql(payload: readonly OsmUnitPayload[], header: string): string {
  const json = JSON.stringify(payload, null, 2);
  if (json.includes("$tf60$")) throw new Error("ข้อมูลมีข้อความ $tf60$ ใช้เป็น SQL ไม่ได้");
  return [
    header,
    "-- ข้อมูล © OpenStreetMap contributors สัญญา ODbL (ดู data/README.md)",
    `-- ${payload.length} หน่วยที่ตรวจแล้ว (verified = ${VERIFIED_YES}) — ไฟล์นี้สร้างอัตโนมัติ ห้ามแก้เอง`,
    `select public.upsert_osm_units($tf60$${json}$tf60$::jsonb);`,
    "",
  ].join("\n");
}

/** จำนวนแถวต่อจังหวัด (แนบ PR / พิมพ์หลังรัน) */
export function countByProvince(rows: readonly UnitRow[]) {
  const counts = new Map<string, { total: number; verified: number }>();
  for (const row of rows) {
    const entry = counts.get(row.province) ?? { total: 0, verified: 0 };
    entry.total++;
    if (row.verified === VERIFIED_YES) entry.verified++;
    counts.set(row.province, entry);
  }
  return [...counts.entries()].sort(
    (a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0], "th"),
  );
}
