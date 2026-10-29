import { latSchema, lngSchema } from "./geo";

export type GmapsParseErrorCode =
  | "EMPTY_INPUT"
  | "INVALID_URL"
  | "NOT_GOOGLE_MAPS"
  | "SHORT_LINK_NEEDS_RESOLVE"
  | "COORDINATES_NOT_FOUND"
  | "OUT_OF_THAILAND"
  | "RESOLVE_FAILED";

export type GmapsParseResult =
  | {
      ok: true;
      lat: number;
      lng: number;
      normalizedUrl: string;
    }
  | {
      ok: false;
      code: GmapsParseErrorCode;
      error: string;
    };

export type GmapsResolveResult =
  | {
      ok: true;
      lat: number;
      lng: number;
      resolvedUrl: string;
    }
  | {
      ok: false;
      code: GmapsParseErrorCode;
      error: string;
    };

// โดเมนของ Google Maps เต็มที่อนุญาต
const GOOGLE_MAPS_HOST_PATTERN =
  /^(?:(?:www|maps)\.)?google\.(?:com|co\.th)$/i;

// โดเมนสำหรับลิงก์ย่อของ Google Maps
const SHORT_GOOGLE_MAPS_HOSTS = new Set([
  "maps.app.goo.gl",
  "goo.gl",
]);

/**
 * ตรวจว่า hostname เป็นโดเมนของ Google Maps หรือไม่
 */
export function isGoogleMapsHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return GOOGLE_MAPS_HOST_PATTERN.test(host) || SHORT_GOOGLE_MAPS_HOSTS.has(host);
}

/**
 * ตรวจว่า URL เป็นลิงก์ย่อของ Google Maps (maps.app.goo.gl หรือ goo.gl/maps/...) หรือไม่
 */
export function isShortGoogleMapsUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  if (host === "maps.app.goo.gl") {
    return url.pathname.length > 1;
  }
  if (host === "goo.gl") {
    return /^\/maps\/.+/i.test(url.pathname);
  }
  return false;
}

/**
 * ดึง URL ตัวแรกออกจากข้อความ (รองรับกรณีผู้ใช้กดแชร์จากแอป Google Maps ลง LINE
 * ซึ่งมักมีชื่อสถานที่หรือข้อความนำหน้าลิงก์ เช่น "ปักหมุด\nhttps://maps.app.goo.gl/...")
 */
export function extractUrlFromInput(rawInput: string): string {
  const trimmed = rawInput.trim();
  const match = trimmed.match(/https?:\/\/[^\s<>]+/i);
  return match ? match[0] : trimmed;
}

/**
 * ตรวจว่าคู่ตัวเลข (lat, lng) อยู่ในขอบเขตประเทศไทยตาม latSchema / lngSchema
 */
function validateThailandCoords(
  lat: number,
  lng: number,
  normalizedUrl: string,
): GmapsParseResult {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      ok: false,
      code: "COORDINATES_NOT_FOUND",
      error: "ไม่พบพิกัดที่ถูกต้องในลิงก์ Google Maps นี้",
    };
  }

  const latCheck = latSchema.safeParse(lat);
  if (!latCheck.success) {
    return {
      ok: false,
      code: "OUT_OF_THAILAND",
      error:
        latCheck.error.issues[0]?.message ??
        "พิกัดอยู่นอกประเทศไทย (ละติจูดต้องอยู่ระหว่าง 5–21°)",
    };
  }

  const lngCheck = lngSchema.safeParse(lng);
  if (!lngCheck.success) {
    return {
      ok: false,
      code: "OUT_OF_THAILAND",
      error:
        lngCheck.error.issues[0]?.message ??
        "พิกัดอยู่นอกประเทศไทย (ลองจิจูดต้องอยู่ระหว่าง 97–106°)",
    };
  }

  return {
    ok: true,
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6)),
    normalizedUrl,
  };
}

/**
 * แปลงข้อความพิกัดแบบ "13.7563, 100.5018" หรือ "loc:13.7563,100.5018" เป็น [lat, lng]
 */
function parseLatLngPair(text: string): [number, number] | null {
  const cleaned = text.trim().replace(/^loc:/i, "").trim();
  const match = cleaned.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2])];
}

/**
 * แปลงพิกัดแบบองศา-ลิปดา-ฟิลิปดา (DMS) เช่น `13°45'22.8"N 100°30'06.4"E` เป็น [lat, lng]
 */
function parseDmsPair(text: string): [number, number] | null {
  const dmsRegex =
    /(\d{1,3})°\s*(\d{1,2})'\s*(\d{1,2}(?:\.\d+)?)"?\s*([NS])[\s,+]+(\d{1,3})°\s*(\d{1,2})'\s*(\d{1,2}(?:\.\d+)?)"?\s*([EW])/i;
  const match = text.match(dmsRegex);
  if (!match) return null;

  const latDeg = Number(match[1]);
  const latMin = Number(match[2]);
  const latSec = Number(match[3]);
  const latHemi = match[4].toUpperCase();

  const lngDeg = Number(match[5]);
  const lngMin = Number(match[6]);
  const lngSec = Number(match[7]);
  const lngHemi = match[8].toUpperCase();

  const lat = (latDeg + latMin / 60 + latSec / 3600) * (latHemi === "S" ? -1 : 1);
  const lng = (lngDeg + lngMin / 60 + lngSec / 3600) * (lngHemi === "W" ? -1 : 1);

  return [lat, lng];
}

/**
 * แปลงลิงก์ Google Maps แบบเต็มเป็นพิกัด lat/lng (ไม่ต้องต่ออินเทอร์เน็ต)
 * รองรับ:
 * 1. พิกัดหมุดจริงใน data parameter: `...!3d13.7563!4d100.5018...`
 * 2. พิกัดใน query parameter: `?q=13.7563,100.5018`, `?query=...`, `?ll=...`, `?center=...`, `?destination=...`
 * 3. พิกัดใน path: `/@13.7563,100.5018,17z`, `/place/13.7563,100.5018`, `/search/13.7563,100.5018`
 * 4. พิกัดแบบ DMS ใน path หรือ query: `13°45'22.8"N 100°30'06.4"E`
 */
export function parseGoogleMapsUrl(rawInput: string): GmapsParseResult {
  if (!rawInput || rawInput.trim().length === 0) {
    return {
      ok: false,
      code: "EMPTY_INPUT",
      error: "กรุณาวางลิงก์ Google Maps",
    };
  }

  const candidate = extractUrlFromInput(rawInput);

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return {
      ok: false,
      code: "INVALID_URL",
      error:
        "รูปแบบลิงก์ไม่ถูกต้อง กรุณาวางลิงก์ที่ขึ้นต้นด้วย https:// จาก Google Maps",
    };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      ok: false,
      code: "INVALID_URL",
      error: "รูปแบบลิงก์ไม่ถูกต้อง กรุณาวางลิงก์ที่ขึ้นต้นด้วย https:// จาก Google Maps",
    };
  }

  if (!isGoogleMapsHost(url.hostname)) {
    return {
      ok: false,
      code: "NOT_GOOGLE_MAPS",
      error:
        "ลิงก์นี้ไม่ใช่ลิงก์ของ Google Maps กรุณาใช้ลิงก์จาก google.com/maps หรือ maps.app.goo.gl",
    };
  }

  // ถ้าเป็นโดเมน google.com แต่ไม่ใช่ path ของ maps (เช่น google.com/search?q=...)
  const host = url.hostname.toLowerCase();
  if (
    !SHORT_GOOGLE_MAPS_HOSTS.has(host) &&
    !host.startsWith("maps.") &&
    !url.pathname.startsWith("/maps")
  ) {
    return {
      ok: false,
      code: "NOT_GOOGLE_MAPS",
      error:
        "ลิงก์นี้ไม่ใช่หน้าแผนที่ Google Maps กรุณาคัดลอกลิงก์จาก Google Maps โดยตรง",
    };
  }

  if (isShortGoogleMapsUrl(url)) {
    return {
      ok: false,
      code: "SHORT_LINK_NEEDS_RESOLVE",
      error: "ลิงก์ย่อต้องแปลงผ่านเซิร์ฟเวอร์เพื่อดึงพิกัดเต็ม",
    };
  }

  const fullDecoded = decodeURIComponent(url.href.replace(/\+/g, " "));

  // รูปแบบที่ 1: !3d<lat>!4d<lng> (พิกัดหมุดจริงของสถานที่ มีความแม่นยำกว่า @lat,lng ที่เป็นจุดกึ่งกลางจอ)
  const pinMatches = [...fullDecoded.matchAll(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g)];
  if (pinMatches.length > 0) {
    const lastPin = pinMatches[pinMatches.length - 1];
    return validateThailandCoords(
      Number(lastPin[1]),
      Number(lastPin[2]),
      url.href,
    );
  }

  // รูปแบบที่ 2: Query parameters (?q=, ?query=, ?ll=, ?center=, ?destination=, ?daddr=)
  const queryKeys = ["q", "query", "ll", "center", "destination", "daddr", "saddr"];
  for (const key of queryKeys) {
    const val = url.searchParams.get(key);
    if (!val) continue;

    const pair = parseLatLngPair(val) ?? parseDmsPair(val);
    if (pair) {
      return validateThailandCoords(pair[0], pair[1], url.href);
    }
  }

  // รูปแบบที่ 3: /@<lat>,<lng> ใน URL path
  const atMatch = fullDecoded.match(/\/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (atMatch) {
    return validateThailandCoords(
      Number(atMatch[1]),
      Number(atMatch[2]),
      url.href,
    );
  }

  // รูปแบบที่ 4: /place/<lat>,<lng> หรือ /search/<lat>,<lng> หรือ /dir//<lat>,<lng>
  const pathCoordMatch = fullDecoded.match(
    /\/(?:place|search|dir\/[^/]*)\/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/,
  );
  if (pathCoordMatch) {
    return validateThailandCoords(
      Number(pathCoordMatch[1]),
      Number(pathCoordMatch[2]),
      url.href,
    );
  }

  // รูปแบบที่ 5: พิกัดแบบองศา-ลิปดา-ฟิลิปดา (DMS) ใน URL
  const dmsPair = parseDmsPair(fullDecoded);
  if (dmsPair) {
    return validateThailandCoords(dmsPair[0], dmsPair[1], url.href);
  }

  return {
    ok: false,
    code: "COORDINATES_NOT_FOUND",
    error:
      "ไม่พบพิกัดในลิงก์ Google Maps นี้ กรุณาแตะปักหมุดจุดเกิดเหตุบนแผนที่แล้วคัดลอกลิงก์อีกครั้ง",
  };
}

/**
 * แปลงลิงก์ Google Maps ทั้งแบบลิงก์เต็มและลิงก์ย่อ (maps.app.goo.gl / goo.gl/maps) เป็นพิกัด lat/lng
 * - ถ้าเป็นลิงก์เต็ม จะแยกพิกัดทันทีโดยไม่ต้องยิงเครือข่าย
 * - ถ้าเป็นลิงก์ย่อ จะตาม HTTP redirect (สูงสุด 5 ขั้น) เฉพาะโดเมนของ Google Maps เท่านั้นเพื่อความปลอดภัย
 */
export async function resolveGoogleMapsLink(
  rawInput: string,
  options?: {
    fetchFn?: typeof fetch;
    maxRedirects?: number;
  },
): Promise<GmapsResolveResult> {
  const direct = parseGoogleMapsUrl(rawInput);
  if (direct.ok) {
    return {
      ok: true,
      lat: direct.lat,
      lng: direct.lng,
      resolvedUrl: direct.normalizedUrl,
    };
  }

  if (direct.code !== "SHORT_LINK_NEEDS_RESOLVE") {
    return direct;
  }

  const fetchFn = options?.fetchFn ?? fetch;
  const maxRedirects = options?.maxRedirects ?? 5;
  let currentUrl = extractUrlFromInput(rawInput);

  try {
    for (let hop = 0; hop < maxRedirects; hop += 1) {
      const parsedCurrent = new URL(currentUrl);
      if (!isGoogleMapsHost(parsedCurrent.hostname)) {
        return {
          ok: false,
          code: "NOT_GOOGLE_MAPS",
          error:
            "ลิงก์ย่อไม่ได้ชี้ไปยัง Google Maps กรุณาตรวจสอบลิงก์อีกครั้ง",
        };
      }

      const response = await fetchFn(currentUrl, {
        method: "GET",
        redirect: "manual",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; NamjaithaiSOS/1.0)",
        },
      });

      const locationHeader = response.headers.get("location");
      if (locationHeader) {
        const nextUrl = new URL(locationHeader, currentUrl).href;
        const attempt = parseGoogleMapsUrl(nextUrl);
        if (attempt.ok) {
          return {
            ok: true,
            lat: attempt.lat,
            lng: attempt.lng,
            resolvedUrl: attempt.normalizedUrl,
          };
        }

        if (attempt.code === "OUT_OF_THAILAND" || attempt.code === "NOT_GOOGLE_MAPS") {
          return attempt;
        }

        currentUrl = nextUrl;
        continue;
      }

      // กรณี fetch ตาม redirect ให้แล้ว (เช่นในบางสภาพแวดล้อม) หรือส่งหน้า HTML ที่มีลิงก์เต็มกลับมา
      if (response.url && response.url !== currentUrl) {
        const fromResponseUrl = parseGoogleMapsUrl(response.url);
        if (fromResponseUrl.ok) {
          return {
            ok: true,
            lat: fromResponseUrl.lat,
            lng: fromResponseUrl.lng,
            resolvedUrl: fromResponseUrl.normalizedUrl,
          };
        }
      }

      const html = await response.text();
      const embeddedMatch = html.match(
        /https:\/\/(?:www\.|maps\.)?google\.(?:com|co\.th)\/maps[^\s"'<>\\]+/i,
      );
      if (embeddedMatch) {
        const unescaped = embeddedMatch[0].replace(/&amp;/g, "&");
        const fromHtml = parseGoogleMapsUrl(unescaped);
        if (fromHtml.ok) {
          return {
            ok: true,
            lat: fromHtml.lat,
            lng: fromHtml.lng,
            resolvedUrl: fromHtml.normalizedUrl,
          };
        }
      }

      break;
    }

    const finalAttempt = parseGoogleMapsUrl(currentUrl);
    if (finalAttempt.ok) {
      return {
        ok: true,
        lat: finalAttempt.lat,
        lng: finalAttempt.lng,
        resolvedUrl: finalAttempt.normalizedUrl,
      };
    }

    if (finalAttempt.code === "OUT_OF_THAILAND") {
      return finalAttempt;
    }

    return {
      ok: false,
      code: "COORDINATES_NOT_FOUND",
      error:
        "ไม่พบพิกัดจากลิงก์ย่อ Google Maps นี้ กรุณาเปิดลิงก์ใน Google Maps แล้วปักหมุดจุดเกิดเหตุอีกครั้ง",
    };
  } catch {
    return {
      ok: false,
      code: "RESOLVE_FAILED",
      error:
        "ไม่สามารถเปิดลิงก์ย่อ Google Maps ได้ในขณะนี้ กรุณาตรวจสอบอินเทอร์เน็ตหรือใช้ปุ่มดึงพิกัด GPS แทน",
    };
  }
}
