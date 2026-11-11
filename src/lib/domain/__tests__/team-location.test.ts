import { describe, expect, it } from "vitest";
import {
  decideLocationSend,
  distanceMeters,
  isLocationSharingPath,
  teamPinAgeLabel,
  teamPinState,
} from "@/lib/domain";

const NAN = { lat: 18.7756, lng: 100.773 };
// 0.0001° ละติจูด ≈ 11 ม.
const moved = (meters: number) => ({ ...NAN, lat: NAN.lat + meters / 111_195 });

describe("TF-28 ส่งตำแหน่งเมื่อไหร่", () => {
  it("วัดระยะได้ถูก (±1%)", () => {
    expect(distanceMeters(NAN, moved(2000))).toBeGreaterThan(1980);
    expect(distanceMeters(NAN, moved(2000))).toBeLessThan(2020);
  });

  it("ครั้งแรกส่งทันที · คลาดเกิน 1,000 ม. ไม่ส่ง", () => {
    expect(decideLocationSend({ ...NAN, accuracyM: 30 }, null, 0)).toEqual({ send: true });
    expect(decideLocationSend({ ...NAN, accuracyM: 1001 }, null, 0)).toEqual({
      send: false,
      reason: "INACCURATE",
    });
    expect(decideLocationSend({ ...NAN, accuracyM: Number.NaN }, null, 0).send).toBe(false);
  });

  it("ไม่ถี่กว่า 15 วินาที แม้ขยับไกล", () => {
    const last = { ...NAN, accuracyM: 20, sentAt: 0 };
    expect(decideLocationSend({ ...moved(500), accuracyM: 20 }, last, 14_999)).toEqual({
      send: false,
      reason: "TOO_SOON",
    });
    expect(decideLocationSend({ ...moved(500), accuracyM: 20 }, last, 15_000)).toEqual({
      send: true,
    });
  });

  it("ขยับไม่เกิน 20 ม. ไม่ส่ง แต่ยืนนิ่งเกิน 60 วินาทีส่งยืนยันว่ายังเปิดโหมดอยู่", () => {
    const last = { ...NAN, accuracyM: 20, sentAt: 0 };
    expect(decideLocationSend({ ...moved(15), accuracyM: 20 }, last, 30_000)).toEqual({
      send: false,
      reason: "NOT_MOVED",
    });
    expect(decideLocationSend({ ...moved(25), accuracyM: 20 }, last, 30_000)).toEqual({
      send: true,
    });
    expect(decideLocationSend({ ...moved(0), accuracyM: 20 }, last, 60_000)).toEqual({
      send: true,
    });
  });
});

describe("TF-28 หมุดทีม", () => {
  const at = new Date(1_000_000_000_000);
  it("เกิน 2 นาทีสีจาง เกิน 15 นาทีไม่แสดง", () => {
    expect(teamPinState(at, at.getTime() + 119_000)).toBe("fresh");
    expect(teamPinState(at, at.getTime() + 121_000)).toBe("stale");
    expect(teamPinState(at, at.getTime() + 15 * 60_000 + 1)).toBe("hidden");
  });

  it("ป้ายเวลา", () => {
    expect(teamPinAgeLabel(at, at.getTime() + 30_000)).toBe("อัปเดตเมื่อสักครู่");
    expect(teamPinAgeLabel(at, at.getTime() + 3 * 60_000 + 5_000)).toBe("อัปเดต 3 นาทีที่แล้ว");
  });

  it("เปิดโหมดได้เฉพาะแผนที่กู้ภัยและงานของฉัน", () => {
    expect(isLocationSharingPath("/rescue/map")).toBe(true);
    expect(isLocationSharingPath("/rescue/my-tasks")).toBe(true);
    expect(isLocationSharingPath("/rescue/cases")).toBe(false);
    expect(isLocationSharingPath("/rescue/map/x")).toBe(false);
    expect(isLocationSharingPath(null)).toBe(false);
  });
});
