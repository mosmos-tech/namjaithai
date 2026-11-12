import { describe, expect, it } from "vitest";
import {
  CaseStatus,
  distanceText,
  etaMinutes,
  etaText,
  REPORTER_ETA_SPEED_KMH,
  reporterStatusView,
  secondsAgoText,
  TRACK_STEPS,
  trackScreen,
} from "..";

describe("TF-42 เวลาที่คาดว่าจะถึง", () => {
  it("ระยะทาง ÷ ความเร็วเฉลี่ย 30 กม./ชม. ปัดขึ้นเป็นนาที", () => {
    expect(REPORTER_ETA_SPEED_KMH).toBe(30);
    expect(etaMinutes(5000)).toBe(10);
    expect(etaMinutes(5001)).toBe(11);
    expect(etaMinutes(30_000)).toBe(60);
  });

  it("ใกล้มาก/ระยะเพี้ยนติดลบ ยังบอกอย่างน้อย 1 นาที", () => {
    expect(etaMinutes(0)).toBe(1);
    expect(etaMinutes(-50)).toBe(1);
  });

  it("ข้อความเวลาและระยะ", () => {
    expect(etaText(8)).toBe("ประมาณ 8 นาที");
    expect(etaText(60)).toBe("ประมาณ 1 ชม.");
    expect(etaText(85)).toBe("ประมาณ 1 ชม. 25 นาที");
    expect(distanceText(864)).toBe("860 ม.");
    expect(distanceText(2345)).toBe("2.3 กม.");
    expect(distanceText(15_400)).toBe("15 กม.");
  });

  it("อัปเดตล่าสุด x วินาทีที่แล้ว", () => {
    const now = Date.parse("2026-11-12T03:00:00Z");
    expect(secondsAgoText("2026-11-12T02:59:58Z", now)).toBe("เมื่อสักครู่");
    expect(secondsAgoText("2026-11-12T02:59:35Z", now)).toBe("25 วินาทีที่แล้ว");
    expect(secondsAgoText(new Date("2026-11-12T02:57:00Z"), now)).toBe("3 นาทีที่แล้ว");
  });
});

describe("TF-42 หน้าจอและแถบสถานะ 5 ขั้น", () => {
  it("3 หน้าจอ: รอทีม / กำลังมา / ถึงแล้ว", () => {
    expect(trackScreen(CaseStatus.NEW)).toBe("waiting");
    expect(trackScreen(CaseStatus.ACCEPTED)).toBe("waiting");
    expect(trackScreen(CaseStatus.EN_ROUTE)).toBe("en_route");
    expect(trackScreen(CaseStatus.ON_SITE)).toBe("arrived");
    expect(trackScreen(CaseStatus.AWAITING_CONFIRMATION)).toBe("arrived");
    expect(trackScreen(CaseStatus.RESOLVED)).toBe("closed");
    expect(trackScreen(CaseStatus.CANCELLED)).toBe("closed");
  });

  it("สถานะ → ขั้นของแถบ (รับแจ้ง → ทีมรับเคส → กำลังมา → ถึงแล้ว → สำเร็จ)", () => {
    expect(TRACK_STEPS).toEqual(["รับแจ้ง", "ทีมรับเคส", "กำลังมา", "ถึงแล้ว", "สำเร็จ"]);
    const step = (status: CaseStatus) => reporterStatusView(status).progress;
    expect(step(CaseStatus.NEW)).toEqual({ done: 1, active: true });
    expect(step(CaseStatus.ACCEPTED)).toEqual({ done: 2, active: false });
    expect(step(CaseStatus.EN_ROUTE)).toEqual({ done: 2, active: true });
    expect(step(CaseStatus.ON_SITE)).toEqual({ done: 4, active: false });
    expect(step(CaseStatus.AWAITING_CONFIRMATION)).toEqual({ done: 4, active: true });
    expect(step(CaseStatus.RESOLVED)).toEqual({ done: 5, active: false });
    expect(step(CaseStatus.CANCELLED)).toBeNull();
  });
});
