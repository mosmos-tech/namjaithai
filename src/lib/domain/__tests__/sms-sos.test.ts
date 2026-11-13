import { describe, expect, it } from "vitest";
import {
  buildSosSmsLink,
  buildSosSmsLinkFromJson,
  formatSmsReply,
  formatSmsSos,
  IncidentType,
  normalizeThaiPhone,
  parseSmsSos,
  smsHref,
  SMS_EXAMPLE,
} from "..";

describe("TF-36 อ่านข้อความ SMS", () => {
  it("อ่านตัวอย่างในการ์ดได้ครบ P = คนทั้งหมด", () => {
    expect(parseSmsSos("SOS FLOOD ROOF 13.75,100.50 P5 B1 C0 E2")).toEqual({
      ok: true,
      data: {
        incidentType: "FLOOD",
        waterLevel: "ROOF",
        lat: 13.75,
        lng: 100.5,
        adults: 2,
        elderly: 2,
        bedridden: 1,
        children: 0,
      },
    });
  });

  it("ตัวอย่างในข้อความตอบกลับอ่านได้จริง", () => {
    expect(parseSmsSos(SMS_EXAMPLE).ok).toBe(true);
  });

  it("ยอมตัวพิมพ์เล็ก ช่องว่างเกิน และช่องว่างหลังจุลภาค (คนพิมพ์เอง)", () => {
    const result = parseSmsSos("  sos   flood 13.75 , 100.50   p3 ");
    expect(result).toMatchObject({ ok: true, data: { lat: 13.75, lng: 100.5, adults: 3 } });
  });

  it("ไม่ใส่ประเภทเหตุ = น้ำท่วม · ไม่ใส่จำนวนคน = ผู้ส่ง 1 คน", () => {
    expect(parseSmsSos("SOS 13.75,100.50")).toMatchObject({
      ok: true,
      data: { incidentType: "FLOOD", adults: 1, elderly: 0, bedridden: 0, children: 0 },
    });
  });

  it("P น้อยกว่าผลรวมกลุ่มอื่น ผู้ใหญ่ไม่ติดลบ", () => {
    expect(parseSmsSos("SOS FLOOD 13.75,100.50 P1 B1 C2")).toMatchObject({
      ok: true,
      data: { adults: 0, bedridden: 1, children: 2 },
    });
  });

  it("ข้อความผิดรูปแบบบอกเหตุผล", () => {
    expect(parseSmsSos("ช่วยด้วย น้ำท่วม")).toEqual({ ok: false, reason: "NOT_SOS" });
    expect(parseSmsSos("SOS FLOOD")).toEqual({ ok: false, reason: "NO_LOCATION" });
    expect(parseSmsSos("SOS FLOOD 13.75,100.50 X9")).toEqual({ ok: false, reason: "BAD_FORMAT" });
    expect(parseSmsSos("SOS FLOOD 13.75,100.50 P2 P3")).toEqual({
      ok: false,
      reason: "BAD_FORMAT",
    });
    expect(parseSmsSos("SOS FLOOD 35.68,139.69")).toEqual({ ok: false, reason: "OUT_OF_AREA" });
  });

  it("ประเภทเหตุที่ยังไม่รับทาง SMS ตอบแยก", () => {
    expect(parseSmsSos("SOS FIRE 13.75,100.50")).toEqual({
      ok: false,
      reason: "UNSUPPORTED_INCIDENT",
    });
  });

  it("ไม่มีช่องสีความเร่งด่วน — ส่ง R มาถือว่าผิดรูปแบบ", () => {
    expect(parseSmsSos("SOS R FLOOD 13.75,100.50")).toEqual({ ok: false, reason: "BAD_FORMAT" });
  });
});

describe("TF-36 สร้างข้อความ SMS", () => {
  it("สร้างจากร่างฟอร์ม แล้วอ่านกลับได้ค่าเดิม", () => {
    const draft = {
      incidentType: "FLOOD" as const,
      waterLevel: "WAIST_CHEST" as const,
      lat: 13.756331,
      lng: 100.501768,
      adults: 2,
      elderly: 1,
      bedridden: 1,
      children: 3,
    };
    const text = formatSmsSos(draft);
    expect(text).toBe("SOS FLOOD WAIST_CHEST 13.75633,100.50177 P7 B1 C3 E1");
    expect(parseSmsSos(text)).toMatchObject({
      ok: true,
      data: { adults: 2, elderly: 1, bedridden: 1, children: 3, waterLevel: "WAIST_CHEST" },
    });
  });

  it("ลิงก์เปิดแอปข้อความพร้อมเบอร์และข้อความ", () => {
    expect(smsHref("0800000000", "SOS FLOOD 13.75,100.5 P1")).toBe(
      "sms:0800000000?body=SOS%20FLOOD%2013.75%2C100.5%20P1",
    );
  });

  it("TF-69: buildSosSmsLink สร้างลิงก์ SMS เข้าระบบเมื่อมี gateway และเป็น FLOOD", () => {
    const link = buildSosSmsLink(
      {
        incidentType: IncidentType.FLOOD,
        lat: 13.75,
        lng: 100.5,
        adults: 2,
        elderly: 1,
        phone: "0812345678",
        landmark: "ซอย 4",
      },
      "0800000000",
    );
    expect(link.toSystem).toBe(true);
    expect(link.href.startsWith("sms:0800000000?body=")).toBe(true);
    expect(decodeURIComponent(link.href.split("?body=")[1])).toContain("SOS FLOOD 13.75000,100.50000");
  });

  it("TF-69: buildSosSmsLink สลับเป็นข้อความทั่วไปเมื่อไม่มี gateway หรือไม่ใช่เหตุ FLOOD", () => {
    const noGateway = buildSosSmsLink(
      {
        incidentType: IncidentType.FLOOD,
        lat: 13.75,
        lng: 100.5,
        landmark: "หน้าโรงเรียน",
        phone: "0812345678",
      },
      "",
    );
    expect(noGateway.toSystem).toBe(false);
    expect(decodeURIComponent(noGateway.href)).toContain("พิกัด 13.75,100.5");

    const fireWithGateway = buildSosSmsLink(
      {
        incidentType: IncidentType.FIRE,
        lat: 13.75,
        lng: 100.5,
      },
      "0800000000",
    );
    expect(fireWithGateway.toSystem).toBe(false);
    expect(fireWithGateway.href.startsWith("sms:?body=")).toBe(true);
  });

  it("TF-69: buildSosSmsLinkFromJson รองรับ JSON พังหรือไม่มีพิกัด", () => {
    const invalid = buildSosSmsLinkFromJson("{not-json", "0800000000");
    expect(invalid.toSystem).toBe(false);
    expect(decodeURIComponent(invalid.href)).toContain("ขอความช่วยเหลือฉุกเฉิน กรุณาติดต่อกลับ");
  });
});

describe("TF-36 เบอร์และข้อความตอบกลับ", () => {
  it("แปลงเบอร์จากผู้ให้บริการเป็นรูปแบบเดียวกับฟอร์ม", () => {
    expect(normalizeThaiPhone("+66812345678")).toBe("0812345678");
    expect(normalizeThaiPhone("66812345678")).toBe("0812345678");
    expect(normalizeThaiPhone("081-234-5678")).toBe("0812345678");
    expect(normalizeThaiPhone("+15555550123")).toBeNull();
    expect(normalizeThaiPhone("1669")).toBeNull();
  });

  it("ตอบสำเร็จมีรหัสเคส ลิงก์ติดตาม และลิงก์ /privacy", () => {
    const text = formatSmsReply("CREATED", {
      origin: "https://example.test",
      caseCode: "FL-2611-0001",
      trackingToken: "a".repeat(32),
    });
    expect(text).toContain("FL-2611-0001");
    expect(text).toContain(`https://example.test/track/FL-2611-0001?t=${"a".repeat(32)}`);
    expect(text).toContain("https://example.test/privacy");
  });

  it("ผิดรูปแบบตอบวิธีส่งที่ถูกพร้อมสายด่วน", () => {
    const text = formatSmsReply("HELP", { origin: "https://example.test" });
    expect(text).toContain(SMS_EXAMPLE);
    expect(text).toContain("1669");
  });
});
