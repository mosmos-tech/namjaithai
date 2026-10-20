import { describe, it, expect } from "vitest";
import { priorityScore } from "../priority";
import { Urgency } from "../enums";

describe("priorityScore — ลำดับสี", () => {
  it("RED > YELLOW > GREEN เสมอ (ไม่มีผู้ป่วยหรือเด็ก)", () => {
    const red = priorityScore({ urgency: Urgency.RED, bedridden: 0, children: 0 });
    const yellow = priorityScore({ urgency: Urgency.YELLOW, bedridden: 0, children: 0 });
    const green = priorityScore({ urgency: Urgency.GREEN, bedridden: 0, children: 0 });
    expect(red).toBeGreaterThan(yellow);
    expect(yellow).toBeGreaterThan(green);
  });

  it("RED + ไม่มีใคร ยังมากกว่า YELLOW + ผู้ป่วยเยอะมาก (50+50 คน)", () => {
    const redMin = priorityScore({ urgency: Urgency.RED, bedridden: 0, children: 0 });
    const yellowMax = priorityScore({ urgency: Urgency.YELLOW, bedridden: 50, children: 50 });
    expect(redMin).toBeGreaterThan(yellowMax);
  });

  it("YELLOW + ไม่มีใคร ยังมากกว่า GREEN + ผู้ป่วยเยอะมาก (50+50 คน)", () => {
    const yellowMin = priorityScore({ urgency: Urgency.YELLOW, bedridden: 0, children: 0 });
    const greenMax = priorityScore({ urgency: Urgency.GREEN, bedridden: 50, children: 50 });
    expect(yellowMin).toBeGreaterThan(greenMax);
  });
});

describe("priorityScore — คะแนนพิเศษ", () => {
  it("บวกคะแนนผู้ป่วยติดเตียง", () => {
    const base = priorityScore({ urgency: Urgency.GREEN, bedridden: 0, children: 0 });
    const withBedridden = priorityScore({ urgency: Urgency.GREEN, bedridden: 2, children: 0 });
    expect(withBedridden).toBeGreaterThan(base);
  });

  it("บวกคะแนนเด็กเล็ก", () => {
    const base = priorityScore({ urgency: Urgency.GREEN, bedridden: 0, children: 0 });
    const withChildren = priorityScore({ urgency: Urgency.GREEN, bedridden: 0, children: 3 });
    expect(withChildren).toBeGreaterThan(base);
  });

  it("ผู้ป่วย + เด็ก บวกเข้ากันได้", () => {
    const bedriddenOnly = priorityScore({ urgency: Urgency.YELLOW, bedridden: 2, children: 0 });
    const childrenOnly = priorityScore({ urgency: Urgency.YELLOW, bedridden: 0, children: 2 });
    const both = priorityScore({ urgency: Urgency.YELLOW, bedridden: 2, children: 2 });
    expect(both).toBeGreaterThan(bedriddenOnly);
    expect(both).toBeGreaterThan(childrenOnly);
  });
});
