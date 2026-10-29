import { describe, it, expect, vi } from "vitest";
import {
  parseGoogleMapsUrl,
  resolveGoogleMapsLink,
  extractUrlFromInput,
} from "../gmaps";

describe("TF-10: แปลงลิงก์ Google Maps เป็นพิกัด (gmaps)", () => {
  it("รูปแบบที่ 1: ลิงก์เต็มแบบสถานที่ (!3d<lat>!4d<lng>) ดึงพิกัดหมุดจริงไม่ใช่จุดกึ่งกลางจอ (@)", () => {
    const url =
      "https://www.google.com/maps/place/%E0%B8%A7%E0%B8%B1%E0%B8%94%E0%B8%9E%E0%B8%A3%E0%B8%B0%E0%B9%81%E0%B8%81%E0%B9%89%E0%B8%A7/@13.751,100.490,17z/data=!3m1!4b1!4m6!3m5!1s0x30e299!8m2!3d13.751644!4d100.492704!16zL20vMDJ5";

    const res = parseGoogleMapsUrl(url);
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("Expected ok");
    expect(res.lat).toBeCloseTo(13.751644, 5);
    expect(res.lng).toBeCloseTo(100.492704, 5);
  });

  it("รูปแบบที่ 2: ลิงก์เต็มแบบ /@<lat>,<lng>,<zoom>z", () => {
    const url = "https://www.google.co.th/maps/@18.788344,98.985301,15z";

    const res = parseGoogleMapsUrl(url);
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("Expected ok");
    expect(res.lat).toBeCloseTo(18.788344, 5);
    expect(res.lng).toBeCloseTo(98.985301, 5);
  });

  it("รูปแบบที่ 3: ลิงก์เต็มแบบ Query Parameter (?q=, ?query=, ?ll=, ?destination=)", () => {
    const urls = [
      "https://www.google.com/maps?q=13.7563,100.5018",
      "https://www.google.com/maps/search/?api=1&query=13.7563,100.5018",
      "https://maps.google.com/?ll=13.7563,100.5018&z=16",
      "https://www.google.com/maps/dir/?api=1&destination=13.7563,100.5018",
      "https://www.google.com/maps?q=loc:13.7563,100.5018",
    ];

    for (const url of urls) {
      const res = parseGoogleMapsUrl(url);
      expect(res.ok).toBe(true);
      if (!res.ok) throw new Error(`Expected ok for ${url}`);
      expect(res.lat).toBeCloseTo(13.7563, 4);
      expect(res.lng).toBeCloseTo(100.5018, 4);
    }
  });

  it("รูปแบบที่ 4: ลิงก์เต็มแบบ /maps/place/<lat>,<lng> และ /maps/search/<lat>,<lng>", () => {
    const placeUrl = "https://www.google.com/maps/place/14.353212,100.568954";
    const searchUrl = "https://www.google.com/maps/search/14.353212,+100.568954";

    for (const url of [placeUrl, searchUrl]) {
      const res = parseGoogleMapsUrl(url);
      expect(res.ok).toBe(true);
      if (!res.ok) throw new Error(`Expected ok for ${url}`);
      expect(res.lat).toBeCloseTo(14.353212, 5);
      expect(res.lng).toBeCloseTo(100.568954, 5);
    }
  });

  it("รูปแบบที่ 5: ลิงก์ที่มีพิกัดแบบองศา-ลิปดา-ฟิลิปดา (DMS)", () => {
    const dmsUrl =
      "https://www.google.com/maps/place/13%C2%B045'22.8%22N+100%C2%B030'06.4%22E";

    const res = parseGoogleMapsUrl(dmsUrl);
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("Expected ok");
    expect(res.lat).toBeCloseTo(13.756333, 4);
    expect(res.lng).toBeCloseTo(100.501778, 4);
  });

  it("รูปแบบที่ 6: ลิงก์ย่อ maps.app.goo.gl และ goo.gl/maps (รวมกรณีมีข้อความนำหน้าจาก LINE)", async () => {
    const mockFetch = vi.fn<typeof fetch>(async () => {
      return new Response(null, {
        status: 302,
        headers: {
          location:
            "https://www.google.com/maps/place/Chiang+Mai/@18.7883,98.9853,16z/data=!3d18.788344!4d98.985301",
        },
      });
    });

    const lineShareText =
      "ปักหมุดใกล้ฉัน ช่วยด้วยครับ https://maps.app.goo.gl/AbCdEfGh12345";
    expect(extractUrlFromInput(lineShareText)).toBe(
      "https://maps.app.goo.gl/AbCdEfGh12345",
    );

    const res = await resolveGoogleMapsLink(lineShareText, { fetchFn: mockFetch });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("Expected ok");
    expect(res.lat).toBeCloseTo(18.788344, 5);
    expect(res.lng).toBeCloseTo(98.985301, 5);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("เกณฑ์ข้อ 2: ลิงก์ที่ไม่ใช่ Google Maps ตอบ error ภาษาไทยที่อ่านเข้าใจ", async () => {
    const nonGmapsUrls = [
      "https://www.facebook.com/share/p/123456",
      "https://example.com/maps/@13.7563,100.5018,15z",
      "https://www.google.com/search?q=น้ำท่วมเชียงราย",
    ];

    for (const url of nonGmapsUrls) {
      const res = await resolveGoogleMapsLink(url);
      expect(res.ok).toBe(false);
      if (res.ok) throw new Error("Expected error");
      expect(res.code).toBe("NOT_GOOGLE_MAPS");
      expect(res.error).toContain("Google Maps");
    }
  });

  it("ลิงก์ที่ผิดรูปแบบ ลิงก์ไม่มีพิกัด หรือพิกัดอยู่นอกประเทศไทย ตอบ error ที่เข้าใจง่าย", () => {
    const emptyRes = parseGoogleMapsUrl("   ");
    expect(emptyRes.ok).toBe(false);
    if (!emptyRes.ok) {
      expect(emptyRes.code).toBe("EMPTY_INPUT");
      expect(emptyRes.error).toContain("กรุณาวางลิงก์");
    }

    const noCoordRes = parseGoogleMapsUrl("https://www.google.com/maps");
    expect(noCoordRes.ok).toBe(false);
    if (!noCoordRes.ok) {
      expect(noCoordRes.code).toBe("COORDINATES_NOT_FOUND");
      expect(noCoordRes.error).toContain("ไม่พบพิกัด");
    }

    const outsideThailandRes = parseGoogleMapsUrl(
      "https://www.google.com/maps?q=35.6762,139.6503",
    );
    expect(outsideThailandRes.ok).toBe(false);
    if (!outsideThailandRes.ok) {
      expect(outsideThailandRes.code).toBe("OUT_OF_THAILAND");
      expect(outsideThailandRes.error).toContain("พิกัดอยู่นอกประเทศไทย");
    }
  });
});
