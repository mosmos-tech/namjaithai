import { describe, expect, it, vi } from "vitest";
import { canTransition, CaseStatus } from "@/lib/domain/case-status";
import {
  dismissDeviceCase,
  forgetDeviceCase,
  readDeviceCases,
  rememberDeviceCase,
  updateDeviceCaseStatus,
} from "../device-cases";
import { rememberSentCase } from "../sent-case";

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
    rememberDeviceCase(store, {
      caseCode: "FL-2611-0001",
      trackingToken: "first",
      confirmationToken: "secret-1",
    });
    rememberDeviceCase(store, {
      caseCode: "FL-2611-0001",
      trackingToken: "second",
      confirmationToken: "secret-2",
    });
    expect(readDeviceCases(store)).toEqual([
      { caseCode: "FL-2611-0001", trackingToken: "second", confirmationToken: "secret-2" },
    ]);
    forgetDeviceCase(store, "FL-2611-0001");
    expect(readDeviceCases(store)).toEqual([]);
  });

  it("returns legacy entry with no extra keys (toEqual regression guard)", () => {
    const store = storage();
    store.setItem(
      "namjaithai:confirmation-cases",
      JSON.stringify([
        {
          caseCode: "FL-2611-0001",
          trackingToken: "track-token-1",
          confirmationToken: "confirm-token-1",
        },
      ]),
    );
    const read = readDeviceCases(store);
    expect(read).toEqual([
      {
        caseCode: "FL-2611-0001",
        trackingToken: "track-token-1",
        confirmationToken: "confirm-token-1",
      },
    ]);
    expect(Object.keys(read[0])).toEqual(["caseCode", "trackingToken", "confirmationToken"]);
  });

  it("reads entries without confirmationToken cleanly and drops/sanitizes corrupt data", () => {
    const store = storage();
    store.setItem(
      "namjaithai:confirmation-cases",
      JSON.stringify([
        {
          caseCode: "FL-2611-0002",
          trackingToken: "track-token-2",
          lastStatus: CaseStatus.ACCEPTED,
          dismissedPhase: "TRACKING",
        },
        {
          caseCode: "FL-2611-0003",
          trackingToken: "track-token-3",
          confirmationToken: "confirm-token-3",
          lastStatus: "NOT_A_REAL_STATUS",
          dismissedPhase: "SOME_RANDOM_PHASE",
        },
        {
          caseCode: 12345,
          trackingToken: "track-token-4",
        },
        {
          caseCode: "",
          trackingToken: "track-token-5",
        },
        {
          caseCode: "FL-2611-0006",
          trackingToken: null,
        },
        "not-an-object",
        null,
      ]),
    );
    const read = readDeviceCases(store);
    expect(read).toEqual([
      {
        caseCode: "FL-2611-0002",
        trackingToken: "track-token-2",
        lastStatus: CaseStatus.ACCEPTED,
        dismissedPhase: "TRACKING",
      },
      {
        caseCode: "FL-2611-0003",
        trackingToken: "track-token-3",
        confirmationToken: "confirm-token-3",
      },
    ]);
    expect("confirmationToken" in read[0]).toBe(false);
    expect("lastStatus" in read[1]).toBe(false);
    expect("dismissedPhase" in read[1]).toBe(false);
  });

  it("updateDeviceCaseStatus saves lastStatus while preserving confirmationToken and dismissedPhase", () => {
    const store = storage();
    rememberDeviceCase(store, {
      caseCode: "FL-2611-0001",
      trackingToken: "track-1",
      confirmationToken: "confirm-1",
      dismissedPhase: "TRACKING",
    });

    updateDeviceCaseStatus(store, "FL-2611-0001", CaseStatus.EN_ROUTE);
    expect(readDeviceCases(store)).toEqual([
      {
        caseCode: "FL-2611-0001",
        trackingToken: "track-1",
        confirmationToken: "confirm-1",
        lastStatus: CaseStatus.EN_ROUTE,
        dismissedPhase: "TRACKING",
      },
    ]);
  });

  it("dismissDeviceCase handles two-phase dismissal and clears TRACKING on AWAITING_CONFIRMATION", () => {
    const store = storage();
    rememberDeviceCase(store, {
      caseCode: "FL-2611-0001",
      trackingToken: "track-1",
      confirmationToken: "confirm-1",
      lastStatus: CaseStatus.EN_ROUTE,
    });

    // Dismiss during tracking phase
    dismissDeviceCase(store, "FL-2611-0001", "TRACKING");
    expect(readDeviceCases(store)[0].dismissedPhase).toBe("TRACKING");

    // Advance to AWAITING_CONFIRMATION -> dismissedPhase cleared to resurface confirmation
    updateDeviceCaseStatus(store, "FL-2611-0001", CaseStatus.AWAITING_CONFIRMATION);
    const updated = readDeviceCases(store)[0];
    expect(updated.lastStatus).toBe(CaseStatus.AWAITING_CONFIRMATION);
    expect(updated.dismissedPhase).toBeUndefined();
    expect("dismissedPhase" in updated).toBe(false);

    // Second-phase dismissal: dismiss during awaiting confirmation
    dismissDeviceCase(store, "FL-2611-0001", "AWAITING_CONFIRMATION");
    expect(readDeviceCases(store)[0].dismissedPhase).toBe("AWAITING_CONFIRMATION");
  });

  it("rememberSentCase stores case in localStorage even when confirmationToken is omitted", () => {
    const localStore = storage();
    const sessionStore = storage();
    const dispatchSpy = vi.fn();

    vi.stubGlobal("window", {
      localStorage: localStore,
      sessionStorage: sessionStore,
      dispatchEvent: dispatchSpy,
    });

    try {
      rememberSentCase({
        caseCode: "FL-2611-0010",
        trackingToken: "track-10",
        phoneLast4: "1234",
      });

      expect(readDeviceCases(localStore)).toEqual([
        {
          caseCode: "FL-2611-0010",
          trackingToken: "track-10",
          lastStatus: CaseStatus.NEW,
        },
      ]);
      expect(sessionStore.getItem("namjaithai:sent-case")).toContain("FL-2611-0010");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("respects silent option and avoids redundant writes / events", () => {
    const store = storage();
    const dispatchSpy = vi.fn();
    vi.stubGlobal("window", {
      dispatchEvent: dispatchSpy,
    });

    try {
      rememberDeviceCase(store, {
        caseCode: "FL-2611-0001",
        trackingToken: "track-1",
        lastStatus: CaseStatus.NEW,
      });
      expect(dispatchSpy).toHaveBeenCalledTimes(1);
      dispatchSpy.mockClear();

      // Silent updateDeviceCaseStatus does NOT dispatch
      updateDeviceCaseStatus(store, "FL-2611-0001", CaseStatus.ACCEPTED, { silent: true });
      expect(readDeviceCases(store)[0].lastStatus).toBe(CaseStatus.ACCEPTED);
      expect(dispatchSpy).not.toHaveBeenCalled();

      // Unchanged status does NOT write or dispatch
      const setItemSpy = vi.spyOn(store, "setItem");
      updateDeviceCaseStatus(store, "FL-2611-0001", CaseStatus.ACCEPTED);
      expect(setItemSpy).not.toHaveBeenCalled();
      expect(dispatchSpy).not.toHaveBeenCalled();

      // Silent forgetDeviceCase does NOT dispatch
      forgetDeviceCase(store, "FL-2611-0001", { silent: true });
      expect(readDeviceCases(store)).toEqual([]);
      expect(dispatchSpy).not.toHaveBeenCalled();

      // Non-existent forget does NOT write or dispatch
      setItemSpy.mockClear();
      forgetDeviceCase(store, "FL-NON-EXISTENT");
      expect(setItemSpy).not.toHaveBeenCalled();
      expect(dispatchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("transitions an awaiting confirmation case back to NEW when reporter rejects assistance", () => {
    const store = storage();
    rememberDeviceCase(store, {
      caseCode: "FL-2611-0099",
      trackingToken: "track-99",
      confirmationToken: "secret-99",
      lastStatus: CaseStatus.AWAITING_CONFIRMATION,
    });
    expect(readDeviceCases(store)[0].lastStatus).toBe(CaseStatus.AWAITING_CONFIRMATION);

    updateDeviceCaseStatus(store, "FL-2611-0099", CaseStatus.NEW);
    expect(readDeviceCases(store)[0].lastStatus).toBe(CaseStatus.NEW);
  });
});
