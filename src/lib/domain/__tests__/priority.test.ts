import { describe, it, expect } from "vitest";
import { priorityScore } from "../priority";
import { Urgency, WaterLevel } from "../enums";

const base = (urgency: Urgency, overrides?: Partial<Parameters<typeof priorityScore>[0]>) =>
  priorityScore({
    urgency,
    waterLevel: WaterLevel.ANKLE,
    bedridden: 0,
    elderly: 0,
    children: 0,
    createdAt: new Date(),
    ...overrides,
  });

describe("priorityScore — ลำดับสีรับประกัน", () => {
  it("RED > YELLOW > GREEN เมื่อไม่มีโบนัส", () => {
    expect(base(Urgency.RED)).toBeGreaterThan(base(Urgency.YELLOW));
    expect(base(Urgency.YELLOW)).toBeGreaterThan(base(Urgency.GREEN));
  });

  it("RED_MIN ยังมากกว่า YELLOW + โบนัสเต็ม (99+99+99 คน + น้ำสูงสุด + รอ 24 ชม.)", () => {
    const now = new Date();
    const createdAt = new Date(now.getTime() - 24 * 60 * 60_000); // 24 ชม. ที่แล้ว
    const redMin = priorityScore({
      urgency: Urgency.RED,
      waterLevel: WaterLevel.ANKLE,
      bedridden: 0,
      elderly: 0,
      children: 0,
      createdAt: now,
    });
    const yellowBig = priorityScore({
      urgency: Urgency.YELLOW,
      waterLevel: WaterLevel.ROOF,
      bedridden: 99,
      elderly: 99,
      children: 99,
      createdAt,
    }, now);
    expect(redMin).toBeGreaterThan(yellowBig);
  });

  it("YELLOW_MIN ยังมากกว่า GREEN + โบนัสเต็ม", () => {
    const now = new Date();
    const createdAt = new Date(now.getTime() - 24 * 60 * 60_000);
    const yellowMin = priorityScore({
      urgency: Urgency.YELLOW,
      waterLevel: WaterLevel.ANKLE,
      bedridden: 0,
      elderly: 0,
      children: 0,
      createdAt: now,
    });
    const greenBig = priorityScore({
      urgency: Urgency.GREEN,
      waterLevel: WaterLevel.ROOF,
      bedridden: 99,
      elderly: 99,
      children: 99,
      createdAt,
    }, now);
    expect(yellowMin).toBeGreaterThan(greenBig);
  });
});

describe("priorityScore — คะแนนพิเศษ", () => {
  it("ผู้ป่วยติดเตียงเพิ่มคะแนน", () => {
    expect(base(Urgency.GREEN, { bedridden: 3 })).toBeGreaterThan(base(Urgency.GREEN));
  });

  it("ผู้สูงอายุเพิ่มคะแนน", () => {
    expect(base(Urgency.GREEN, { elderly: 3 })).toBeGreaterThan(base(Urgency.GREEN));
  });

  it("เด็กเล็กเพิ่มคะแนน", () => {
    expect(base(Urgency.GREEN, { children: 3 })).toBeGreaterThan(base(Urgency.GREEN));
  });

  it("ระดับน้ำสูงขึ้นเพิ่มคะแนน (ROOF > ANKLE)", () => {
    expect(base(Urgency.GREEN, { waterLevel: WaterLevel.ROOF }))
      .toBeGreaterThan(base(Urgency.GREEN, { waterLevel: WaterLevel.ANKLE }));
  });

  it("รอนานขึ้นเพิ่มคะแนน", () => {
    const now = new Date();
    const createdRecently = new Date(now.getTime() - 5 * 60_000);   // 5 นาที
    const createdLongAgo = new Date(now.getTime() - 60 * 60_000);   // 60 นาที
    const recent = priorityScore({
      urgency: Urgency.GREEN,
      waterLevel: WaterLevel.ANKLE,
      bedridden: 0, elderly: 0, children: 0,
      createdAt: createdRecently,
    }, now);
    const old = priorityScore({
      urgency: Urgency.GREEN,
      waterLevel: WaterLevel.ANKLE,
      bedridden: 0, elderly: 0, children: 0,
      createdAt: createdLongAgo,
    }, now);
    expect(old).toBeGreaterThan(recent);
  });
});

describe("priorityScore — now เป็น parameter", () => {
  it("ส่ง now ตรงๆ ได้ (deterministic ใน test)", () => {
    const fixedNow = new Date("2026-01-01T12:00:00Z");
    const createdAt = new Date("2026-01-01T11:00:00Z"); // รอ 60 นาที
    const score1 = priorityScore(
      { urgency: Urgency.GREEN, waterLevel: WaterLevel.ANKLE, bedridden: 0, elderly: 0, children: 0, createdAt },
      fixedNow,
    );
    const score2 = priorityScore(
      { urgency: Urgency.GREEN, waterLevel: WaterLevel.ANKLE, bedridden: 0, elderly: 0, children: 0, createdAt },
      fixedNow,
    );
    expect(score1).toBe(score2); // ผลเหมือนกันทุกครั้งที่ now เดิม
  });
});
