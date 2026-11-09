import { describe, expect, it } from "vitest";
import { UserRole } from "../roles";
import {
  RESCUE_POLL_INTERVAL_MS,
  RESCUE_REALTIME_DEBOUNCE_MS,
  canUseRealtime,
  isRealtimeEnabled,
} from "../realtime";

describe("TF-27 realtime domain rules", () => {
  it("ใช้ค่าช่วงเวลา poll สำรอง 15 วินาที และ debounce ต่ำกว่าเกณฑ์ 3 วินาที", () => {
    expect(RESCUE_POLL_INTERVAL_MS).toBe(15_000);
    expect(RESCUE_REALTIME_DEBOUNCE_MS).toBeGreaterThan(0);
    expect(RESCUE_REALTIME_DEBOUNCE_MS).toBeLessThan(3_000);
  });

  it("canUseRealtime อนุญาตเฉพาะ RESCUER, UNIT_LEAD, ADMIN — ห้าม USER และผู้ไม่ล็อกอิน", () => {
    expect(canUseRealtime(UserRole.RESCUER)).toBe(true);
    expect(canUseRealtime(UserRole.UNIT_LEAD)).toBe(true);
    expect(canUseRealtime(UserRole.ADMIN)).toBe(true);

    expect(canUseRealtime(UserRole.USER)).toBe(false);
    expect(canUseRealtime(null)).toBe(false);
    expect(canUseRealtime(undefined)).toBe(false);
  });

  it("isRealtimeEnabled รองรับการปิด Realtime ทั้งระบบผ่าน env flag", () => {
    expect(isRealtimeEnabled(undefined)).toBe(true);
    expect(isRealtimeEnabled("")).toBe(true);
    expect(isRealtimeEnabled("true")).toBe(true);
    expect(isRealtimeEnabled("1")).toBe(true);

    expect(isRealtimeEnabled("false")).toBe(false);
    expect(isRealtimeEnabled(" FALSE ")).toBe(false);
    expect(isRealtimeEnabled("0")).toBe(false);
    expect(isRealtimeEnabled("off")).toBe(false);
    expect(isRealtimeEnabled("no")).toBe(false);
  });
});
