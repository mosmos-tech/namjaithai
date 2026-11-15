import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CaseStatus } from "@/lib/domain/case-status";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import {
  CLOSED_DEVICE_STATUSES,
  initialCaseBarEntries,
  isCaseBarAllowedPath,
  selectCaseBarDisplay,
  syncDeviceCases,
  trackedCodeFromPath,
  type CaseBarEntry,
} from "../case-bar";
import {
  readDeviceCases,
  rememberDeviceCase,
  type DeviceCaseRef,
} from "../device-cases";
import { CaseBarView } from "../components/DeviceConfirmationBanner";
import { REPORTER_TEXT_TH } from "@/lib/i18n/reporter-text";
import { REPORTER_TEXT_EN } from "@/lib/i18n/reporter-text.en";

function createMemoryStorage(initialData?: Record<string, string>): Storage {
  const store = new Map<string, string>(Object.entries(initialData ?? {}));
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

describe("TF-81 Case Bar: Route Guards & Path Normalization", () => {
  it("disallows internal, unit, rescuer, and auth routes across locales", () => {
    const disallowed = [
      "/rescue",
      "/rescue/",
      "/rescue/map",
      "/rescue/cases/123",
      "/unit",
      "/unit/dashboard",
      "/admin",
      "/admin/cases",
      "/login",
      "/my-cases",
      "/en/login",
      "/en/rescue/map",
    ];
    for (const path of disallowed) {
      expect(isCaseBarAllowedPath(path), `Expected ${path} to be disallowed`).toBe(false);
    }
  });

  it("allows public reporter pages across locales", () => {
    const allowed = [
      "/",
      "/hotlines",
      "/units",
      "/survival",
      "/request",
      "/track",
      "/track/FL-2611-0004",
      "/en/hotlines",
      "/en/request",
      "/en/track/FL-2611-0004",
      "/survival?tab=first-aid",
    ];
    for (const path of allowed) {
      expect(isCaseBarAllowedPath(path), `Expected ${path} to be allowed`).toBe(true);
    }
  });

  it("extracts uppercase decoded code from track paths and safely handles malformed percent encoding", () => {
    expect(trackedCodeFromPath("/track/fl-2611-0004")).toBe("FL-2611-0004");
    expect(trackedCodeFromPath("/en/track/FL-2611-0004/")).toBe("FL-2611-0004");
    expect(trackedCodeFromPath("/track/FL%2D2611%2D0004")).toBe("FL-2611-0004");
    expect(trackedCodeFromPath("/track/fl-2611-0004?t=secret")).toBe("FL-2611-0004");
    expect(trackedCodeFromPath("/%E0%A4")).toBeNull();
    expect(trackedCodeFromPath("/track/%E0%A4")).toBe("%E0%A4");
    expect(trackedCodeFromPath("/track")).toBeNull();
    expect(trackedCodeFromPath("/track/")).toBeNull();
    expect(trackedCodeFromPath("/en/track")).toBeNull();
    expect(trackedCodeFromPath("/hotlines")).toBeNull();
  });
});

describe("TF-81 Case Bar: Status Selection & Priority", () => {
  const caseA: CaseBarEntry = {
    ref: {
      caseCode: "FL-2611-0001",
      trackingToken: "tok-1",
      lastStatus: CaseStatus.NEW,
    },
    status: "NEW",
  };

  const caseB: CaseBarEntry = {
    ref: {
      caseCode: "FL-2611-0002",
      trackingToken: "tok-2",
      lastStatus: CaseStatus.EN_ROUTE,
    },
    status: "EN_ROUTE",
  };

  const caseConfirmWithToken: CaseBarEntry = {
    ref: {
      caseCode: "FL-2611-0003",
      trackingToken: "tok-3",
      confirmationToken: "conf-token-3",
      lastStatus: CaseStatus.AWAITING_CONFIRMATION,
    },
    status: "AWAITING_CONFIRMATION",
  };

  const caseConfirmWithoutToken: CaseBarEntry = {
    ref: {
      caseCode: "FL-2611-0004",
      trackingToken: "tok-4",
      lastStatus: CaseStatus.AWAITING_CONFIRMATION,
    },
    status: "AWAITING_CONFIRMATION",
  };

  it("selects mode: track for single tracking case", () => {
    const selection = selectCaseBarDisplay([caseA], "/");
    expect(selection).toEqual({
      mode: "track",
      primary: caseA,
      others: [],
    });
  });

  it("suppresses single tracking case on its own tracking page", () => {
    expect(selectCaseBarDisplay([caseA], "/track/FL-2611-0001")).toBeNull();
    expect(selectCaseBarDisplay([caseA], "/en/track/fl-2611-0001")).toBeNull();
  });

  it("surfaces another open case when currently viewed case is in tracking", () => {
    // entriesNewestFirst: caseB (0002) newest, caseA (0001) older
    const selection = selectCaseBarDisplay([caseB, caseA], "/track/FL-2611-0002");
    expect(selection).toEqual({
      mode: "track",
      primary: caseA,
      others: [],
    });
  });

  it("prioritizes case reaching AWAITING_CONFIRMATION with token over newer EN_ROUTE case", () => {
    // caseB is newer, but caseConfirmWithToken has confirmation priority
    const selection = selectCaseBarDisplay([caseB, caseConfirmWithToken], "/");
    expect(selection).toEqual({
      mode: "confirm",
      primary: caseConfirmWithToken,
      others: [caseB],
    });
  });

  it("keeps others tracking-filtered when confirm mode is active on track page", () => {
    // viewing track page for caseB: caseB is suppressed from others
    const selection = selectCaseBarDisplay(
      [caseB, caseConfirmWithToken],
      "/track/FL-2611-0002",
    );
    expect(selection).toEqual({
      mode: "confirm",
      primary: caseConfirmWithToken,
      others: [],
    });
  });

  it("still returns mode: confirm on its own tracking page when awaiting confirmation with token", () => {
    const selection = selectCaseBarDisplay(
      [caseConfirmWithToken],
      "/track/FL-2611-0003",
    );
    expect(selection).toEqual({
      mode: "confirm",
      primary: caseConfirmWithToken,
      others: [],
    });
  });

  it("selects mode: track for AWAITING_CONFIRMATION case without confirmationToken", () => {
    const selection = selectCaseBarDisplay([caseConfirmWithoutToken], "/");
    expect(selection).toEqual({
      mode: "track",
      primary: caseConfirmWithoutToken,
      others: [],
    });

    // On its own tracking page, it is suppressed so ReporterAccountConfirmation can handle LINE
    expect(selectCaseBarDisplay([caseConfirmWithoutToken], "/track/FL-2611-0004")).toBeNull();
  });

  it("handles dismissedPhase: TRACKING hides tracking and promotes next open case", () => {
    const dismissedCaseA: CaseBarEntry = {
      ...caseA,
      ref: { ...caseA.ref, dismissedPhase: "TRACKING" },
    };

    expect(selectCaseBarDisplay([dismissedCaseA], "/")).toBeNull();

    const selectionWithNext = selectCaseBarDisplay([dismissedCaseA, caseB], "/");
    expect(selectionWithNext).toEqual({
      mode: "track",
      primary: caseB,
      others: [],
    });
  });

  it("does not hide AWAITING_CONFIRMATION with token when dismissedPhase is TRACKING", () => {
    const trackingDismissedConfirm: CaseBarEntry = {
      ...caseConfirmWithToken,
      ref: { ...caseConfirmWithToken.ref, dismissedPhase: "TRACKING" },
    };

    const selection = selectCaseBarDisplay([trackingDismissedConfirm], "/");
    expect(selection).toEqual({
      mode: "confirm",
      primary: trackingDismissedConfirm,
      others: [],
    });
  });

  it("hides confirmation when dismissedPhase is AWAITING_CONFIRMATION", () => {
    const confirmDismissed: CaseBarEntry = {
      ...caseConfirmWithToken,
      ref: { ...caseConfirmWithToken.ref, dismissedPhase: "AWAITING_CONFIRMATION" },
    };

    expect(selectCaseBarDisplay([confirmDismissed], "/")).toBeNull();
  });

  it("returns null when on a disallowed path even with active cases", () => {
    expect(selectCaseBarDisplay([caseA], "/rescue/map")).toBeNull();
    expect(selectCaseBarDisplay([caseConfirmWithToken], "/admin/cases")).toBeNull();
    expect(selectCaseBarDisplay([caseB], "/login")).toBeNull();
  });
});

describe("TF-81 Case Bar: initialCaseBarEntries Filtering", () => {
  it("filters out closed statuses from initial entries", () => {
    const rawRefs: DeviceCaseRef[] = [
      { caseCode: "FL-1", trackingToken: "t1", lastStatus: CaseStatus.NEW },
      { caseCode: "FL-2", trackingToken: "t2", lastStatus: CaseStatus.RESOLVED },
      { caseCode: "FL-3", trackingToken: "t3", lastStatus: CaseStatus.CANCELLED },
      { caseCode: "FL-4", trackingToken: "t4", lastStatus: CaseStatus.DUPLICATE },
      { caseCode: "FL-5", trackingToken: "t5", lastStatus: CaseStatus.UNREACHABLE },
      { caseCode: "FL-6", trackingToken: "t6", lastStatus: CaseStatus.EN_ROUTE },
      { caseCode: "FL-7", trackingToken: "t7" }, // missing lastStatus defaults to NEW
    ];

    const initial = initialCaseBarEntries(rawRefs);
    expect(initial).toEqual([
      { ref: rawRefs[0], status: "NEW" },
      { ref: rawRefs[5], status: "EN_ROUTE" },
      { ref: rawRefs[6], status: "NEW" },
    ]);
  });

  it("CLOSED_DEVICE_STATUSES contains all terminal statuses", () => {
    expect(CLOSED_DEVICE_STATUSES).toEqual(
      new Set([
        CaseStatus.RESOLVED,
        CaseStatus.CANCELLED,
        CaseStatus.DUPLICATE,
        CaseStatus.UNREACHABLE,
      ]),
    );
  });
});

describe("TF-81 Case Bar: syncDeviceCases Resilience & Concurrency", () => {
  it("preserves stored entry and cached lastStatus on network rejection, returns stale: true", async () => {
    const store = createMemoryStorage();
    rememberDeviceCase(store, {
      caseCode: "FL-2611-0001",
      trackingToken: "tok-1",
      lastStatus: CaseStatus.ACCEPTED,
    });

    const mockFetch = vi.fn().mockRejectedValue(new Error("Network failure"));

    const result = await syncDeviceCases({
      storage: store,
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(result.stale).toBe(true);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].ref.caseCode).toBe("FL-2611-0001");
    expect(result.entries[0].status).toBe("ACCEPTED");

    // Storage preserved
    const stored = readDeviceCases(store);
    expect(stored).toHaveLength(1);
    expect(stored[0].lastStatus).toBe(CaseStatus.ACCEPTED);
  });

  it("preserves stored entry on HTTP 404, 500, 429, or invalid JSON payload", async () => {
    const store = createMemoryStorage();
    rememberDeviceCase(store, {
      caseCode: "FL-2611-0001",
      trackingToken: "tok-1",
      lastStatus: CaseStatus.EN_ROUTE,
    });

    for (const status of [404, 500, 429]) {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status,
        json: async () => ({ error: "Failed" }),
      });

      const res = await syncDeviceCases({
        storage: store,
        fetchImpl: mockFetch as unknown as typeof fetch,
      });

      expect(res.stale).toBe(true);
      expect(readDeviceCases(store)).toHaveLength(1);
    }

    // Malformed JSON response
    const mockBadJson = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("Invalid JSON");
      },
    });

    const resBadJson = await syncDeviceCases({
      storage: store,
      fetchImpl: mockBadJson as unknown as typeof fetch,
    });
    expect(resBadJson.stale).toBe(true);
    expect(readDeviceCases(store)).toHaveLength(1);

    // Payload missing status
    const mockNoStatus = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ someOtherField: 123 }),
    });

    const resNoStatus = await syncDeviceCases({
      storage: store,
      fetchImpl: mockNoStatus as unknown as typeof fetch,
    });
    expect(resNoStatus.stale).toBe(true);
    expect(readDeviceCases(store)).toHaveLength(1);
  });

  it("removes closed cases on HTTP 200 via forgetDeviceCase while keeping open cases", async () => {
    const store = createMemoryStorage();
    rememberDeviceCase(store, {
      caseCode: "FL-2611-0001",
      trackingToken: "tok-1",
      lastStatus: CaseStatus.EN_ROUTE,
    });
    rememberDeviceCase(store, {
      caseCode: "FL-2611-0002",
      trackingToken: "tok-2",
      lastStatus: CaseStatus.ON_SITE,
    });

    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("FL-2611-0001")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: CaseStatus.RESOLVED }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: CaseStatus.ON_SITE }),
      };
    });

    const result = await syncDeviceCases({
      storage: store,
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(result.stale).toBe(false);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].ref.caseCode).toBe("FL-2611-0002");

    const stored = readDeviceCases(store);
    expect(stored).toHaveLength(1);
    expect(stored[0].caseCode).toBe("FL-2611-0002");
  });

  it("updates stored lastStatus on HTTP 200 with reopened NEW status", async () => {
    const store = createMemoryStorage();
    rememberDeviceCase(store, {
      caseCode: "FL-2611-0001",
      trackingToken: "tok-1",
      lastStatus: CaseStatus.AWAITING_CONFIRMATION,
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: CaseStatus.NEW }),
    });

    const result = await syncDeviceCases({
      storage: store,
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(result.stale).toBe(false);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].status).toBe("NEW");

    const stored = readDeviceCases(store);
    expect(stored[0].lastStatus).toBe(CaseStatus.NEW);
  });

  it("aborts committing stale state when cancelled in-flight", async () => {
    const store = createMemoryStorage();
    rememberDeviceCase(store, {
      caseCode: "FL-2611-0001",
      trackingToken: "tok-1",
      lastStatus: CaseStatus.EN_ROUTE,
    });

    let cancelled = false;
    const mockFetch = vi.fn().mockImplementation(async () => {
      cancelled = true; // cancelled while fetch was pending
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: CaseStatus.AWAITING_CONFIRMATION }),
      };
    });

    await syncDeviceCases({
      storage: store,
      fetchImpl: mockFetch as unknown as typeof fetch,
      isCancelled: () => cancelled,
    });

    // Storage was not overwritten with stale in-flight update
    const stored = readDeviceCases(store);
    expect(stored[0].lastStatus).toBe(CaseStatus.EN_ROUTE);
  });

  it("does not resurrect or overwrite a case removed while fetch was in flight", async () => {
    const store = createMemoryStorage();
    rememberDeviceCase(store, {
      caseCode: "FL-2611-0001",
      trackingToken: "tok-1",
      lastStatus: CaseStatus.AWAITING_CONFIRMATION,
      confirmationToken: "token-1",
    });

    const mockFetch = vi.fn().mockImplementation(async () => {
      // User confirms or dismisses the case in another tab/component while fetch is in-flight
      store.removeItem("namjaithai:confirmation-cases");
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: CaseStatus.AWAITING_CONFIRMATION }),
      };
    });

    const result = await syncDeviceCases({
      storage: store,
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    // Storage remains empty, deleted case was not resurrected
    expect(readDeviceCases(store)).toEqual([]);
    expect(result.entries).toEqual([]);
  });
});

describe("TF-81 Case Bar: Bilingual Dictionary Parity", () => {
  it("contains all required caseBar keys in Thai and English dictionaries", () => {
    const requiredKeys = [
      "regionLabel",
      "caseSummary",
      "offlineHint",
      "viewStatus",
      "hideLabel",
      "moreCases",
      "hideMoreCases",
      "otherCasesLabel",
      "confirmBarHeading",
      "status",
    ] as const;

    const requiredStatuses = [
      "NEW",
      "ACCEPTED",
      "EN_ROUTE",
      "ON_SITE",
      "AWAITING_CONFIRMATION",
    ] as const;

    expect(REPORTER_TEXT_TH.caseBar).toBeDefined();
    expect(REPORTER_TEXT_EN.caseBar).toBeDefined();

    for (const key of requiredKeys) {
      expect(REPORTER_TEXT_TH.caseBar[key], `TH missing ${key}`).toBeDefined();
      expect(REPORTER_TEXT_EN.caseBar[key], `EN missing ${key}`).toBeDefined();
    }

    for (const status of requiredStatuses) {
      expect(REPORTER_TEXT_TH.caseBar.status[status], `TH missing status ${status}`).toBeDefined();
      expect(REPORTER_TEXT_EN.caseBar.status[status], `EN missing status ${status}`).toBeDefined();
    }
  });
});

describe("TF-81 CaseBarView Presentational Component", () => {
  it("renders Thai tracking bar with default useI18n fallback without PII or raw token in text", () => {
    const selection = {
      mode: "track" as const,
      primary: {
        ref: {
          caseCode: "FL-2611-0004",
          trackingToken: "tok-secret-xyz",
          lastStatus: CaseStatus.EN_ROUTE,
        },
        status: "EN_ROUTE" as const,
      },
      others: [],
    };

    const html = renderToStaticMarkup(
      createElement(CaseBarView, {
        selection,
        stale: false,
        expanded: false,
        showTrackLinkOnConfirm: true,
        onToggleExpanded: () => {},
        onDismiss: () => {},
        onConfirmChanged: () => {},
      }),
    );

    expect(html).toContain('data-testid="my-case-bar"');
    expect(html).toContain("เคสของคุณ FL-2611-0004");
    expect(html).toContain("ทีมกำลังมา");
    expect(html).toContain("ดูสถานะ");
    expect(html).toContain('href="/track/FL-2611-0004?t=tok-secret-xyz"');

    // No PII and no token text outside href
    expect(html).not.toContain("0812345678");
    expect(html).not.toContain("สมชาย");
    const textWithoutHrefs = html.replace(/href="[^"]*"/g, "");
    expect(textWithoutHrefs).not.toContain("tok-secret-xyz");
  });

  it("renders English tracking bar wrapped in I18nProvider with /en link", () => {
    const selection = {
      mode: "track" as const,
      primary: {
        ref: {
          caseCode: "FL-2611-0004",
          trackingToken: "tok-secret-xyz",
          lastStatus: CaseStatus.EN_ROUTE,
        },
        status: "EN_ROUTE" as const,
      },
      others: [],
    };

    const html = renderToStaticMarkup(
      createElement(
        I18nProvider,
        { locale: "en", text: REPORTER_TEXT_EN } as unknown as {
          locale: "en";
          text: typeof REPORTER_TEXT_EN;
          children: React.ReactNode;
        },
        createElement(CaseBarView, {
          selection,
          stale: false,
          expanded: false,
          showTrackLinkOnConfirm: true,
          onToggleExpanded: () => {},
          onDismiss: () => {},
          onConfirmChanged: () => {},
        }),
      ),
    );

    expect(html).toContain('data-testid="my-case-bar"');
    expect(html).toContain("Your case FL-2611-0004");
    expect(html).toContain("Team on the way");
    expect(html).toContain("View status");
    expect(html).toContain('href="/en/track/FL-2611-0004?t=tok-secret-xyz"');
    // Zero Thai leakage
    expect(html).not.toContain("เคสของคุณ");
    expect(html).not.toContain("ดูสถานะ");
  });

  it("renders offline indicator (stale: true) alongside last known status without clearing stored entry", () => {
    const selection = {
      mode: "track" as const,
      primary: {
        ref: {
          caseCode: "FL-2611-0004",
          trackingToken: "tok-secret-xyz",
          lastStatus: CaseStatus.ACCEPTED,
        },
        status: "ACCEPTED" as const,
      },
      others: [],
    };

    const html = renderToStaticMarkup(
      createElement(CaseBarView, {
        selection,
        stale: true,
        expanded: false,
        showTrackLinkOnConfirm: true,
        onToggleExpanded: () => {},
        onDismiss: () => {},
        onConfirmChanged: () => {},
      }),
    );

    expect(html).toContain("รับเคสแล้ว");
    expect(html).toContain("(สถานะล่าสุด)");
  });

  it("renders multi-case toggle button and expanded panel without PII", () => {
    const selection = {
      mode: "track" as const,
      primary: {
        ref: {
          caseCode: "FL-2611-0004",
          trackingToken: "tok-primary",
          lastStatus: CaseStatus.EN_ROUTE,
        },
        status: "EN_ROUTE" as const,
      },
      others: [
        {
          ref: {
            caseCode: "FL-2611-0002",
            trackingToken: "tok-secondary",
            lastStatus: CaseStatus.NEW,
          },
          status: "NEW" as const,
        },
      ],
    };

    // Collapsed
    const collapsedHtml = renderToStaticMarkup(
      createElement(CaseBarView, {
        selection,
        stale: false,
        expanded: false,
        showTrackLinkOnConfirm: true,
        onToggleExpanded: () => {},
        onDismiss: () => {},
        onConfirmChanged: () => {},
      }),
    );
    expect(collapsedHtml).toContain("อีก 1 เคส");
    expect(collapsedHtml).toContain('aria-expanded="false"');
    expect(collapsedHtml).not.toContain("FL-2611-0002");

    // Expanded
    const expandedHtml = renderToStaticMarkup(
      createElement(CaseBarView, {
        selection,
        stale: false,
        expanded: true,
        showTrackLinkOnConfirm: true,
        onToggleExpanded: () => {},
        onDismiss: () => {},
        onConfirmChanged: () => {},
      }),
    );
    expect(expandedHtml).toContain("อีก 1 เคส");
    expect(expandedHtml).toContain('aria-expanded="true"');
    expect(expandedHtml).toContain("FL-2611-0002");
    expect(expandedHtml).toContain("รอรับเคส");
    expect(expandedHtml).toContain('href="/track/FL-2611-0002?t=tok-secondary"');
    const textWithoutHrefs = expandedHtml.replace(/href="[^"]*"/g, "");
    expect(textWithoutHrefs).not.toContain("tok-secondary");
  });

  it("renders merged TF-58 confirmation bar with role='region' 'ยืนยันการช่วยเหลือ' and toggles tracking link", () => {
    const selection = {
      mode: "confirm" as const,
      primary: {
        ref: {
          caseCode: "FL-2611-0004",
          trackingToken: "tok-confirm",
          confirmationToken: "token-confirm-xyz",
          lastStatus: CaseStatus.AWAITING_CONFIRMATION,
        },
        status: "AWAITING_CONFIRMATION" as const,
      },
      others: [],
    };

    // On non-track page (showTrackLinkOnConfirm = true)
    const htmlWithTrackLink = renderToStaticMarkup(
      createElement(CaseBarView, {
        selection,
        stale: false,
        expanded: false,
        showTrackLinkOnConfirm: true,
        onToggleExpanded: () => {},
        onDismiss: () => {},
        onConfirmChanged: () => {},
      }),
    );
    expect(htmlWithTrackLink).toContain('data-testid="my-case-bar"');
    expect(htmlWithTrackLink).toContain('aria-label="ยืนยันการช่วยเหลือ"');
    expect(htmlWithTrackLink).toContain("ดูสถานะ");
    expect(htmlWithTrackLink).toContain('href="/track/FL-2611-0004?t=tok-confirm"');

    // On same /track/[code] page (showTrackLinkOnConfirm = false)
    const htmlWithoutTrackLink = renderToStaticMarkup(
      createElement(CaseBarView, {
        selection,
        stale: false,
        expanded: false,
        showTrackLinkOnConfirm: false,
        onToggleExpanded: () => {},
        onDismiss: () => {},
        onConfirmChanged: () => {},
      }),
    );
    expect(htmlWithoutTrackLink).toContain('aria-label="ยืนยันการช่วยเหลือ"');
    expect(htmlWithoutTrackLink).not.toContain("ดูสถานะ");
  });

  it("returns null when selection is null", () => {
    const html = renderToStaticMarkup(
      createElement(CaseBarView, {
        selection: null,
        stale: false,
        expanded: false,
        showTrackLinkOnConfirm: true,
        onToggleExpanded: () => {},
        onDismiss: () => {},
        onConfirmChanged: () => {},
      }),
    );
    expect(html).toBe("");
  });
});

describe("TF-81 HomeConfirmationLoader Contract & Cold-Load Preservation", () => {
  it("has 'use client' on line 1 and contains zero static domain/banner imports", () => {
    const filePath = path.resolve(
      __dirname,
      "../components/HomeConfirmationLoader.tsx",
    );
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split(/\r?\n/);

    expect(lines[0].trim()).toBe('"use client";');
    expect(content).not.toMatch(/import\s+.*from\s+["'].*DeviceConfirmationBanner["']/);
    expect(content).not.toMatch(/import\s+.*from\s+["'].*syncDeviceCases["']/);
    expect(content).not.toMatch(/import\s+.*from\s+["'].*device-cases["']/);
    expect(content).toContain('import("./DeviceConfirmationBanner")');
  });
});
