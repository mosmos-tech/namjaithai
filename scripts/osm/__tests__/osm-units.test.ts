import { describe, expect, it } from "vitest";
import {
  buildOverpassQuery,
  dedupeRows,
  elementName,
  formatCsv,
  guessOrganization,
  KNOWN_ORGANIZATIONS,
  matchReason,
  mergeVerified,
  organizationPhone,
  parseCsv,
  sortRows,
  unitsSql,
  USER_AGENT,
  verifiedPayload,
  type UnitRow,
} from "../osm-units.ts";

function row(partial: Partial<UnitRow>): UnitRow {
  return {
    osm_id: "node/1",
    name: "หน่วยกู้ภัยทดสอบ",
    organization: "",
    province: "กรุงเทพมหานคร",
    district: "พระนคร",
    lat: "13.750000",
    lng: "100.500000",
    phone: "",
    fetched_at: "2026-11-08",
    match_reason: "ambulance_station",
    verified: "ไม่",
    ...partial,
  };
}

describe("TF-60 Overpass query", () => {
  it("ค้นทั้ง node และ way ในขอบเขตไทย พร้อมจุดกลาง", () => {
    const query = buildOverpassQuery();
    expect(query).toContain('area["ISO3166-1"="TH"][admin_level=2]->.th;');
    expect(query).toContain('node["emergency"="ambulance_station"](area.th);');
    expect(query).toContain('way["amenity"="rescue_station"](area.th);');
    expect(query).toContain(
      'way["office"]["name"~"มูลนิธิ|กู้ภัย|กู้ชีพ|ร่วมกตัญญู|ป่อเต็กตึ๊ง|ปอเต็กตึ๊ง"]',
    );
    expect(query).not.toContain("relation");
    expect(query).toMatch(/out center tags;$/);
  });

  it("User-Agent เป็นชื่อโปรเจกต์ ไม่มีอีเมล", () => {
    expect(USER_AGENT).toContain("namjaithai");
    expect(USER_AGENT).not.toMatch(/@/);
  });
});

describe("TF-60 เดาองค์กรจากตาราง alias", () => {
  it("ป่อเต็กตึ๊ง/ปอเต็กตึ๊ง/อังกฤษ → มูลนิธิป่อเต็กตึ๊ง", () => {
    expect(guessOrganization("ปอเต็กตึ๊ง ศูนย์วิทยุ")).toBe("มูลนิธิป่อเต็กตึ๊ง");
    expect(guessOrganization("มูลนิธิป่อเต็กตึ๊ง สาขาบางรัก")).toBe("มูลนิธิป่อเต็กตึ๊ง");
    expect(guessOrganization("Poh Teck Tung Foundation")).toBe("มูลนิธิป่อเต็กตึ๊ง");
  });

  it("ร่วมกตัญญู (มีช่องว่างแปลกๆ ก็ยังจับได้)", () => {
    expect(guessOrganization("หน่วยร่วม กตัญญู บางนา")).toBe("มูลนิธิร่วมกตัญญู");
  });

  it("ชื่อที่ไม่อยู่ในตาราง ไม่เดาเอง (ว่าง)", () => {
    expect(guessOrganization("มูลนิธิสว่างหัวหินธรรมสถาน")).toBe("");
    expect(KNOWN_ORGANIZATIONS.has("มูลนิธิสว่างหัวหินธรรมสถาน")).toBe(false);
  });
});

describe("TF-60 จัดประเภทและชื่อ", () => {
  it("tag emergency/rescue มาก่อนคำในชื่อ", () => {
    expect(matchReason({ emergency: "ambulance_station", name: "มูลนิธิ" })).toBe(
      "ambulance_station",
    );
    expect(matchReason({ amenity: "rescue_station" })).toBe("rescue_station");
    expect(matchReason({ office: "ngo", name: "มูลนิธิกู้ภัยทดสอบ" })).toBe("name_keyword");
    expect(matchReason({ shop: "yes", name: "มูลนิธิ" })).toBeNull();
  });

  it("ใช้แค่ tag name ไม่ใช้ operator หรือ contact:name (อาจเป็นชื่อบุคคล)", () => {
    expect(elementName({ operator: "นายสมชาย", "contact:name": "นางสมศรี" })).toBe("");
    expect(elementName({ name: "  กู้ภัย   ทดสอบ ", operator: "นายสมชาย" })).toBe("กู้ภัย ทดสอบ");
  });
});

describe("TF-60 เบอร์องค์กรเท่านั้น", () => {
  it("รับสายด่วน 4 หลักและเบอร์สำนักงาน (+66 แปลงเป็น 0)", () => {
    expect(organizationPhone({ phone: "1669" })).toBe("1669");
    expect(organizationPhone({ phone: "+66 76 488 619" })).toBe("076488619");
    expect(organizationPhone({ "contact:phone": "02-123-4567" })).toBe("021234567");
  });

  it("ไม่เก็บเบอร์มือถือ (มักเป็นเบอร์ส่วนตัว) — มีหลายเบอร์ใช้เบอร์องค์กรตัวแรก", () => {
    expect(organizationPhone({ phone: "081-234-5678" })).toBe("");
    expect(organizationPhone({ phone: "+66812345678;053-000-000" })).toBe("053000000");
  });
});

describe("TF-60 ตัดแถวซ้ำและเรียง", () => {
  it("osm_id เดียวกัน หรือชื่อเดียวกันห่างไม่เกิน 100 ม. เหลือแถวเดียว (เก็บแถวที่มี tag/เบอร์)", () => {
    const rows = dedupeRows([
      row({ osm_id: "way/2", match_reason: "name_keyword" }),
      row({ osm_id: "node/1", lat: "13.750500", phone: "1669" }), // ห่าง ~55 ม.
      row({ osm_id: "node/1" }),
      row({ osm_id: "node/3", lat: "13.760000" }), // ชื่อเดียวกันแต่ห่าง ~1.1 กม.
    ]);
    expect(rows.map((r) => r.osm_id).sort()).toEqual(["node/1", "node/3"]);
    expect(rows.find((r) => r.osm_id === "node/1")?.phone).toBe("1669");
  });

  it("แถวที่มี tag emergency/rescue ขึ้นก่อน แล้วเรียงจังหวัด", () => {
    const sorted = sortRows([
      row({ osm_id: "node/1", province: "กระบี่", match_reason: "name_keyword" }),
      row({ osm_id: "node/2", province: "ลำปาง", match_reason: "ambulance_station" }),
      row({ osm_id: "node/3", province: "ชลบุรี", match_reason: "rescue_station" }),
    ]);
    expect(sorted.map((r) => r.osm_id)).toEqual(["node/3", "node/2", "node/1"]);
  });
});

describe("TF-60 รันซ้ำไม่ทับค่า verified", () => {
  it("แถวเดิมคงค่า verified · แถวใหม่เป็น ไม่ · แถวที่ตรวจแล้วแต่หายจาก OSM เก็บไว้", () => {
    const previous = [
      row({ osm_id: "node/1", verified: "ใช่" }),
      row({ osm_id: "node/2", verified: "ใช่", name: "หายไปแล้ว" }),
      row({ osm_id: "node/3", verified: "ไม่" }),
    ];
    const next = [row({ osm_id: "node/1" }), row({ osm_id: "node/3" }), row({ osm_id: "node/4" })];
    const { rows, missingVerified } = mergeVerified(previous, next);
    const verified = Object.fromEntries(rows.map((r) => [r.osm_id, r.verified]));
    expect(verified).toEqual({
      "node/1": "ใช่",
      "node/2": "ใช่",
      "node/3": "ไม่",
      "node/4": "ไม่",
    });
    expect(missingVerified.map((r) => r.osm_id)).toEqual(["node/2"]);
  });
});

describe("TF-60 CSV", () => {
  it("เขียนแล้วอ่านกลับได้ค่าเดิม (ชื่อมีจุลภาคและเครื่องหมายคำพูด)", () => {
    const rows = [
      row({ name: 'มูลนิธิ "ทดสอบ", สาขา 1' }),
      row({ osm_id: "way/9", phone: "1669" }),
    ];
    const csv = formatCsv(rows);
    expect(csv.split("\n")[0]).toBe(
      "osm_id,name,organization,province,district,lat,lng,phone,fetched_at,match_reason,verified",
    );
    expect(parseCsv(csv)).toEqual(rows);
  });

  it("CSV ขาดคอลัมน์ แจ้งชัดเจน", () => {
    expect(() => parseCsv("osm_id,name\nnode/1,x\n")).toThrow(/ขาดคอลัมน์/);
  });
});

describe("TF-60 แถวที่ตรวจแล้ว → SQL", () => {
  it("ส่งเฉพาะ verified = ใช่", () => {
    const { payload, errors } = verifiedPayload([
      row({ osm_id: "node/1", verified: "ใช่", organization: "มูลนิธิร่วมกตัญญู", phone: "1669" }),
      row({ osm_id: "node/2", verified: "ไม่" }),
    ]);
    expect(errors).toEqual([]);
    expect(payload).toEqual([
      {
        osm_id: "node/1",
        name: "หน่วยกู้ภัยทดสอบ",
        organization: "มูลนิธิร่วมกตัญญู",
        province: "กรุงเทพมหานคร",
        district: "พระนคร",
        phone: "1669",
      },
    ]);
  });

  it("ห้ามองค์กรนอกตาราง alias และห้ามเบอร์มือถือ", () => {
    const { errors } = verifiedPayload([
      row({ osm_id: "node/1", verified: "ใช่", organization: "มูลนิธิที่เดาเอง" }),
      row({ osm_id: "node/2", verified: "ใช่", phone: "0812345678" }),
    ]);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain("ไม่อยู่ในตาราง alias");
    expect(errors[1]).toContain("ห้ามเบอร์มือถือ");
  });

  it("SQL เรียก upsert_osm_units พร้อมเครดิต ODbL", () => {
    const sql = unitsSql([], "-- test");
    expect(sql).toContain("© OpenStreetMap contributors");
    expect(sql).toContain("select public.upsert_osm_units($tf60$[]$tf60$::jsonb);");
  });
});
