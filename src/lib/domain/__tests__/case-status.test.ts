import { describe, it, expect } from "vitest";
import { canTransition, CaseStatus } from "../case-status";

const { NEW, ACCEPTED, EN_ROUTE, ON_SITE, RESOLVED, CANCELLED, DUPLICATE, UNREACHABLE } =
  CaseStatus;

describe("canTransition — เส้นทางปกติ", () => {
  it("NEW → ACCEPTED ได้", () => expect(canTransition(NEW, ACCEPTED)).toBe(true));
  it("ACCEPTED → EN_ROUTE ได้", () => expect(canTransition(ACCEPTED, EN_ROUTE)).toBe(true));
  it("EN_ROUTE → ON_SITE ได้", () => expect(canTransition(EN_ROUTE, ON_SITE)).toBe(true));
  it("ON_SITE → RESOLVED ได้", () => expect(canTransition(ON_SITE, RESOLVED)).toBe(true));
});

describe("canTransition — ปล่อยเคสกลับ NEW", () => {
  it("ACCEPTED → NEW ได้ (ปล่อยเคส)", () => expect(canTransition(ACCEPTED, NEW)).toBe(true));
  it("EN_ROUTE → NEW ได้ (ปล่อยเคส)", () => expect(canTransition(EN_ROUTE, NEW)).toBe(true));
});

describe("canTransition — ปิดเคส", () => {
  it("NEW → CANCELLED ได้", () => expect(canTransition(NEW, CANCELLED)).toBe(true));
  it("ACCEPTED → DUPLICATE ได้", () => expect(canTransition(ACCEPTED, DUPLICATE)).toBe(true));
  it("EN_ROUTE → UNREACHABLE ได้", () => expect(canTransition(EN_ROUTE, UNREACHABLE)).toBe(true));
  it("ON_SITE → CANCELLED ได้", () => expect(canTransition(ON_SITE, CANCELLED)).toBe(true));
});

describe("canTransition — ห้ามข้ามขั้น", () => {
  it("NEW → ON_SITE ไม่ได้", () => expect(canTransition(NEW, ON_SITE)).toBe(false));
  it("NEW → EN_ROUTE ไม่ได้", () => expect(canTransition(NEW, EN_ROUTE)).toBe(false));
  it("NEW → RESOLVED ไม่ได้", () => expect(canTransition(NEW, RESOLVED)).toBe(false));
  it("ACCEPTED → ON_SITE ไม่ได้", () => expect(canTransition(ACCEPTED, ON_SITE)).toBe(false));
  it("ACCEPTED → RESOLVED ไม่ได้", () => expect(canTransition(ACCEPTED, RESOLVED)).toBe(false));
  it("EN_ROUTE → RESOLVED ไม่ได้", () => expect(canTransition(EN_ROUTE, RESOLVED)).toBe(false));
});

describe("canTransition — terminal state", () => {
  it("RESOLVED → NEW ไม่ได้", () => expect(canTransition(RESOLVED, NEW)).toBe(false));
  it("RESOLVED → ACCEPTED ไม่ได้", () => expect(canTransition(RESOLVED, ACCEPTED)).toBe(false));
  it("CANCELLED → NEW ไม่ได้", () => expect(canTransition(CANCELLED, NEW)).toBe(false));
  it("DUPLICATE → CANCELLED ไม่ได้", () => expect(canTransition(DUPLICATE, CANCELLED)).toBe(false));
  it("UNREACHABLE → RESOLVED ไม่ได้", () => expect(canTransition(UNREACHABLE, RESOLVED)).toBe(false));
});
