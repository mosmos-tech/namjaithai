import { CaseStatus } from "@/lib/domain/case-status";
import { stripLocale } from "@/lib/i18n/locale";
import {
  forgetDeviceCase,
  readDeviceCases,
  updateDeviceCaseStatus,
  type DeviceCaseRef,
} from "./device-cases";

export const CLOSED_DEVICE_STATUSES: ReadonlySet<CaseStatus> = new Set<CaseStatus>([
  CaseStatus.RESOLVED,
  CaseStatus.CANCELLED,
  CaseStatus.DUPLICATE,
  CaseStatus.UNREACHABLE,
]);

export type OpenDeviceStatus =
  | "NEW"
  | "ACCEPTED"
  | "EN_ROUTE"
  | "ON_SITE"
  | "AWAITING_CONFIRMATION";

export type CaseBarEntry = {
  ref: DeviceCaseRef;
  status: OpenDeviceStatus;
};

export type ConfirmCaseBarEntry = {
  ref: DeviceCaseRef & { confirmationToken: string };
  status: "AWAITING_CONFIRMATION";
};

export type CaseBarSelection =
  | { mode: "confirm"; primary: ConfirmCaseBarEntry; others: CaseBarEntry[] }
  | { mode: "track"; primary: CaseBarEntry; others: CaseBarEntry[] }
  | null;

const DISALLOWED_PREFIXES = ["/rescue", "/unit", "/admin", "/login", "/my-cases"];

const OPEN_STATUS_SET = new Set<string>([
  "NEW",
  "ACCEPTED",
  "EN_ROUTE",
  "ON_SITE",
  "AWAITING_CONFIRMATION",
]);

export function isCaseBarAllowedPath(pathname: string): boolean {
  if (!pathname) return false;
  try {
    const clean = pathname.split(/[?#]/)[0] ?? "";
    const { path: rawPath } = stripLocale(clean);
    const normalized =
      rawPath.length > 1 && rawPath.endsWith("/")
        ? rawPath.slice(0, -1)
        : rawPath;
    for (const prefix of DISALLOWED_PREFIXES) {
      if (normalized === prefix || normalized.startsWith(prefix + "/")) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

export function trackedCodeFromPath(pathname: string): string | null {
  if (!pathname) return null;
  try {
    const clean = pathname.split(/[?#]/)[0] ?? "";
    const { path: rawPath } = stripLocale(clean);
    if (!rawPath.startsWith("/track/")) {
      return null;
    }
    const remainder = rawPath.slice("/track/".length);
    const segments = remainder.split("/").filter(Boolean);
    if (segments.length === 0) return null;
    const rawCode = segments[0];
    let decoded: string;
    try {
      decoded = decodeURIComponent(rawCode);
    } catch {
      decoded = rawCode;
    }
    const normalized = decoded.trim().toUpperCase();
    return normalized.length > 0 ? normalized : null;
  } catch {
    return null;
  }
}

function toOpenDeviceStatus(status?: CaseStatus): OpenDeviceStatus | null {
  if (!status) return "NEW";
  if (CLOSED_DEVICE_STATUSES.has(status)) return null;
  if (OPEN_STATUS_SET.has(status)) return status as OpenDeviceStatus;
  return null;
}

export function initialCaseBarEntries(entries: DeviceCaseRef[]): CaseBarEntry[] {
  const result: CaseBarEntry[] = [];
  for (const ref of entries) {
    const status = toOpenDeviceStatus(ref.lastStatus);
    if (!status) continue;
    result.push({ ref, status });
  }
  return result;
}

function isConfirmEligible(entry: CaseBarEntry): entry is ConfirmCaseBarEntry {
  return (
    entry.status === "AWAITING_CONFIRMATION" &&
    typeof entry.ref.confirmationToken === "string" &&
    entry.ref.confirmationToken.length > 0 &&
    entry.ref.dismissedPhase !== "AWAITING_CONFIRMATION"
  );
}

function isTrackEligible(entry: CaseBarEntry, currentTrackedCode: string | null): boolean {
  if (entry.ref.dismissedPhase === "TRACKING") {
    return false;
  }
  if (
    entry.status === "AWAITING_CONFIRMATION" &&
    entry.ref.dismissedPhase === "AWAITING_CONFIRMATION"
  ) {
    return false;
  }
  if (currentTrackedCode && entry.ref.caseCode.toUpperCase() === currentTrackedCode) {
    return false;
  }
  return true;
}

export function selectCaseBarDisplay(
  entriesNewestFirst: CaseBarEntry[],
  pathname: string,
): CaseBarSelection {
  if (!isCaseBarAllowedPath(pathname)) {
    return null;
  }

  const currentTrackedCode = trackedCodeFromPath(pathname);

  // Check for confirm eligibility first (priority over tracking)
  const confirmEntries = entriesNewestFirst.filter(isConfirmEligible);
  if (confirmEntries.length > 0) {
    const primary =
      (currentTrackedCode
        ? confirmEntries.find((e) => e.ref.caseCode.toUpperCase() === currentTrackedCode)
        : undefined) ?? confirmEntries[0];

    const others = entriesNewestFirst.filter(
      (e) => e.ref.caseCode !== primary.ref.caseCode && isTrackEligible(e, currentTrackedCode),
    );

    return {
      mode: "confirm",
      primary,
      others,
    };
  }

  // Tracking mode
  const trackEntries = entriesNewestFirst.filter((entry) =>
    isTrackEligible(entry, currentTrackedCode),
  );

  if (trackEntries.length === 0) {
    return null;
  }

  const primary = trackEntries[0];
  const others = trackEntries.slice(1);

  return {
    mode: "track",
    primary,
    others,
  };
}

export async function syncDeviceCases(options: {
  storage: Storage;
  fetchImpl?: typeof fetch;
  isCancelled?: () => boolean;
}): Promise<{ entries: CaseBarEntry[]; stale: boolean }> {
  const fetcher = options.fetchImpl ?? (typeof fetch !== "undefined" ? fetch : undefined);
  if (!fetcher) {
    return {
      entries: initialCaseBarEntries([...readDeviceCases(options.storage)].reverse()),
      stale: true,
    };
  }

  const initialStored = readDeviceCases(options.storage);
  if (initialStored.length === 0) {
    return { entries: [], stale: false };
  }

  let hasError = false;

  for (const item of initialStored) {
    if (options.isCancelled?.()) {
      return {
        entries: initialCaseBarEntries([...readDeviceCases(options.storage)].reverse()),
        stale: true,
      };
    }

    try {
      const response = await fetcher(
        `/api/track/${encodeURIComponent(item.caseCode)}?t=${encodeURIComponent(item.trackingToken)}`,
        { cache: "no-store" },
      );

      if (options.isCancelled?.()) {
        return {
          entries: initialCaseBarEntries([...readDeviceCases(options.storage)].reverse()),
          stale: true,
        };
      }

      if (!response.ok) {
        hasError = true;
        continue;
      }

      let data: unknown;
      try {
        data = await response.json();
      } catch {
        hasError = true;
        continue;
      }

      if (
        !data ||
        typeof data !== "object" ||
        !("status" in data) ||
        typeof (data as { status: unknown }).status !== "string"
      ) {
        hasError = true;
        continue;
      }

      const status = (data as { status: string }).status;

      // Guard: re-read storage to ensure entry was not removed/confirmed concurrently while fetch was in-flight
      const currentStored = readDeviceCases(options.storage);
      const stillExists = currentStored.some((x) => x.caseCode === item.caseCode);
      if (!stillExists) {
        continue;
      }

      if (CLOSED_DEVICE_STATUSES.has(status as CaseStatus)) {
        forgetDeviceCase(options.storage, item.caseCode, { silent: true });
      } else if (OPEN_STATUS_SET.has(status)) {
        updateDeviceCaseStatus(options.storage, item.caseCode, status as CaseStatus, {
          silent: true,
        });
      } else {
        hasError = true;
      }
    } catch {
      hasError = true;
    }
  }

  const finalStored = readDeviceCases(options.storage);
  return {
    entries: initialCaseBarEntries([...finalStored].reverse()),
    stale: hasError,
  };
}
