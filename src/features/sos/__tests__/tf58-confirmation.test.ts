import { describe, expect, it } from "vitest";
import { canTransition, CaseStatus } from "@/lib/domain/case-status";
import { forgetDeviceCase, readDeviceCases, rememberDeviceCase } from "../device-cases";
function storage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}
describe("TF-58 confirmation", () => {
  it("permits only the reporter reopen channel from awaiting and never skips on-site to resolved", () => {
    expect(canTransition(CaseStatus.AWAITING_CONFIRMATION, CaseStatus.NEW, "reporterReopen")).toBe(
      true,
    );
    expect(canTransition(CaseStatus.ON_SITE, CaseStatus.NEW, "reporterReopen")).toBe(false);
    expect(canTransition(CaseStatus.ON_SITE, CaseStatus.RESOLVED, "leadClose")).toBe(false);
  });
  it("remembers tokens on this device, deduplicates and forgets confirmed cases", () => {
    const store = storage();
    rememberDeviceCase(store, { caseCode: "FL-2611-0001", trackingToken: "first" });
    rememberDeviceCase(store, { caseCode: "FL-2611-0001", trackingToken: "second" });
    expect(readDeviceCases(store)).toEqual([{ caseCode: "FL-2611-0001", trackingToken: "second" }]);
    forgetDeviceCase(store, "FL-2611-0001");
    expect(readDeviceCases(store)).toEqual([]);
  });
});
