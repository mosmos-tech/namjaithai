// TF-58: keep only the capability needed to find this device's pending confirmations.
// TF-81: extended with optional cached lastStatus and two-phase dismissal.
import { CaseStatus } from "@/lib/domain/case-status";

export type DeviceCaseDismissPhase = "TRACKING" | "AWAITING_CONFIRMATION";

export type DeviceCaseRef = {
  caseCode: string;
  trackingToken: string;
  confirmationToken?: string;
  lastStatus?: CaseStatus;
  dismissedPhase?: DeviceCaseDismissPhase;
};

export type DeviceCaseUpdateOptions = {
  silent?: boolean;
};

const KEY = "namjaithai:confirmation-cases";
const VALID_CASE_STATUSES = new Set<string>(Object.values(CaseStatus));

export function readDeviceCases(storage: Storage): DeviceCaseRef[] {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return [];
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];

    const result: DeviceCaseRef[] = [];
    for (const x of data) {
      if (
        !x ||
        typeof x !== "object" ||
        typeof x.caseCode !== "string" ||
        x.caseCode.length === 0 ||
        typeof x.trackingToken !== "string" ||
        x.trackingToken.length === 0
      ) {
        continue;
      }
      const item: DeviceCaseRef = {
        caseCode: x.caseCode,
        trackingToken: x.trackingToken,
      };
      if (typeof x.confirmationToken === "string" && x.confirmationToken.length > 0) {
        item.confirmationToken = x.confirmationToken;
      }
      if (typeof x.lastStatus === "string" && VALID_CASE_STATUSES.has(x.lastStatus)) {
        item.lastStatus = x.lastStatus as CaseStatus;
      }
      if (x.dismissedPhase === "TRACKING" || x.dismissedPhase === "AWAITING_CONFIRMATION") {
        item.dismissedPhase = x.dismissedPhase;
      }
      result.push(item);
    }
    return result.slice(-20);
  } catch {
    return [];
  }
}

export function rememberDeviceCase(storage: Storage, item: DeviceCaseRef): void {
  try {
    const cases = readDeviceCases(storage);
    const existingIndex = cases.findIndex((x) => x.caseCode === item.caseCode);
    const existing = existingIndex >= 0 ? cases[existingIndex] : undefined;
    const remaining = existingIndex >= 0 ? cases.filter((_, i) => i !== existingIndex) : cases;

    const merged: DeviceCaseRef = {
      caseCode: item.caseCode,
      trackingToken: item.trackingToken || existing?.trackingToken || "",
    };

    const confirmationToken = item.confirmationToken ?? existing?.confirmationToken;
    if (confirmationToken) merged.confirmationToken = confirmationToken;

    const lastStatus = item.lastStatus ?? existing?.lastStatus;
    if (lastStatus) merged.lastStatus = lastStatus;

    const dismissedPhase =
      item.dismissedPhase !== undefined
        ? item.dismissedPhase
        : item.lastStatus === CaseStatus.NEW
          ? undefined
          : existing?.dismissedPhase;
    if (dismissedPhase) merged.dismissedPhase = dismissedPhase;

    storage.setItem(KEY, JSON.stringify([...remaining, merged].slice(-20)));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("namjaithai:device-cases"));
    }
  } catch {
    /* private browsing can disallow storage */
  }
}

export function forgetDeviceCase(
  storage: Storage,
  caseCode: string,
  options?: DeviceCaseUpdateOptions,
): void {
  try {
    const cases = readDeviceCases(storage);
    const exists = cases.some((x) => x.caseCode === caseCode);
    if (!exists) return;
    const remaining = cases.filter((x) => x.caseCode !== caseCode);
    storage.setItem(KEY, JSON.stringify(remaining));
    if (!options?.silent && typeof window !== "undefined") {
      window.dispatchEvent(new Event("namjaithai:device-cases"));
    }
  } catch {
    /* storage unavailable */
  }
}

export function updateDeviceCaseStatus(
  storage: Storage,
  caseCode: string,
  status: CaseStatus,
  options?: DeviceCaseUpdateOptions,
): void {
  try {
    const cases = readDeviceCases(storage);
    const index = cases.findIndex((x) => x.caseCode === caseCode);
    if (index < 0) return;
    const prev = cases[index];

    const nextStatus = status;
    let nextDismissedPhase = prev.dismissedPhase;
    if (status === CaseStatus.AWAITING_CONFIRMATION && prev.dismissedPhase === "TRACKING") {
      nextDismissedPhase = undefined;
    }

    const statusChanged = prev.lastStatus !== nextStatus;
    const dismissalChanged = prev.dismissedPhase !== nextDismissedPhase;
    if (!statusChanged && !dismissalChanged) return;

    const updated: DeviceCaseRef = {
      caseCode: prev.caseCode,
      trackingToken: prev.trackingToken,
      ...(prev.confirmationToken ? { confirmationToken: prev.confirmationToken } : {}),
      lastStatus: nextStatus,
      ...(nextDismissedPhase ? { dismissedPhase: nextDismissedPhase } : {}),
    };

    const nextCases = [...cases];
    nextCases[index] = updated;
    storage.setItem(KEY, JSON.stringify(nextCases));
    if (!options?.silent && typeof window !== "undefined") {
      window.dispatchEvent(new Event("namjaithai:device-cases"));
    }
  } catch {
    /* storage unavailable */
  }
}

export function dismissDeviceCase(
  storage: Storage,
  caseCode: string,
  phase: DeviceCaseDismissPhase,
): void {
  try {
    const cases = readDeviceCases(storage);
    const index = cases.findIndex((x) => x.caseCode === caseCode);
    if (index < 0) return;
    const prev = cases[index];
    if (prev.dismissedPhase === phase) return;

    const updated: DeviceCaseRef = {
      caseCode: prev.caseCode,
      trackingToken: prev.trackingToken,
      ...(prev.confirmationToken ? { confirmationToken: prev.confirmationToken } : {}),
      ...(prev.lastStatus ? { lastStatus: prev.lastStatus } : {}),
      dismissedPhase: phase,
    };

    const nextCases = [...cases];
    nextCases[index] = updated;
    storage.setItem(KEY, JSON.stringify(nextCases));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("namjaithai:device-cases"));
    }
  } catch {
    /* storage unavailable */
  }
}
