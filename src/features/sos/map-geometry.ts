import type { AreaBounds } from "../../lib/domain";

// รัศมีโลกเฉลี่ย (เมตร) — พอสำหรับวาดวงความคลาดเคลื่อนบนแผนที่ ไม่ต้องแม่นระดับสำรวจ
const EARTH_RADIUS_M = 6_371_008.8;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/**
 * จุดรอบวงกลมรัศมี radiusM เมตร (TF-65) ใช้วาดวงความคลาดเคลื่อนของ GPS เป็นระยะจริงบนแผนที่
 * คืน [lng, lat] ตามรูปแบบ GeoJSON และปิดวง (จุดสุดท้าย = จุดแรก)
 */
export function circlePolygon(
  center: { lat: number; lng: number },
  radiusM: number,
  steps = 64,
): [number, number][] {
  const lat1 = toRad(center.lat);
  const lng1 = toRad(center.lng);
  const angular = radiusM / EARTH_RADIUS_M;
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const bearing = (2 * Math.PI * (i % steps)) / steps;
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
    );
    const lng2 =
      lng1 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
        Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
      );
    ring.push([toDeg(lng2), toDeg(lat2)]);
  }
  return ring;
}

/** กรอบสี่เหลี่ยมที่ครอบวงกลมทั้งวง ใช้ซูมแผนที่ให้เห็นวงความคลาดเคลื่อนครบ */
export function circleBounds(center: { lat: number; lng: number }, radiusM: number): AreaBounds {
  const dLat = toDeg(radiusM / EARTH_RADIUS_M);
  const dLng = dLat / Math.cos(toRad(center.lat));
  return {
    west: center.lng - dLng,
    south: center.lat - dLat,
    east: center.lng + dLng,
    north: center.lat + dLat,
  };
}

/** ระยะทางบนผิวโลก (เมตร) ระหว่าง 2 จุด สูตร haversine */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}
