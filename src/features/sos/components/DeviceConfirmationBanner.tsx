"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { format, localePath } from "@/lib/i18n/locale";
import { trackPath } from "@/lib/domain/tracking";
import {
  dismissDeviceCase,
  readDeviceCases,
} from "../device-cases";
import {
  initialCaseBarEntries,
  selectCaseBarDisplay,
  syncDeviceCases,
  trackedCodeFromPath,
  type CaseBarEntry,
  type CaseBarSelection,
} from "../case-bar";
import { ConfirmationActions } from "./ConfirmationActions";

export type CaseBarViewProps = {
  selection: CaseBarSelection;
  stale: boolean;
  expanded: boolean;
  showTrackLinkOnConfirm: boolean;
  onToggleExpanded: () => void;
  onDismiss: (entry: CaseBarEntry, mode: "confirm" | "track") => void;
  onConfirmChanged: () => void;
};

export function CaseBarView({
  selection,
  stale,
  expanded,
  showTrackLinkOnConfirm,
  onToggleExpanded,
  onDismiss,
  onConfirmChanged,
}: CaseBarViewProps): ReactElement | null {
  const { locale, t } = useI18n();

  if (!selection) return null;

  const { mode, primary, others } = selection;

  if (mode === "confirm") {
    return (
      <div
        data-testid="my-case-bar"
        className="border-b border-amber-200 bg-amber-50 text-text-primary"
      >
        <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
          <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2.5">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <p className="break-words text-sm font-semibold text-amber-950 sm:text-base">
                {format(t.caseBar.caseSummary, { code: primary.ref.caseCode })}
              </p>
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                {t.caseBar.status[primary.status]}
              </span>
              {stale && (
                <span className="text-xs text-amber-900">{t.caseBar.offlineHint}</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {showTrackLinkOnConfirm && (
                <a
                  href={localePath(
                    trackPath(primary.ref.caseCode, primary.ref.trackingToken),
                    locale,
                  )}
                  className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-lg border border-amber-600 bg-white px-3 py-1.5 text-sm font-semibold text-amber-900 hover:bg-amber-100"
                >
                  {t.caseBar.viewStatus}
                </a>
              )}
              {others.length > 0 && (
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={onToggleExpanded}
                  className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-sm font-semibold text-text-secondary hover:bg-amber-100"
                >
                  {format(t.caseBar.moreCases, { count: others.length })}
                </button>
              )}
              <button
                type="button"
                aria-label={t.caseBar.hideLabel}
                onClick={() => onDismiss(primary, "confirm")}
                className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-lg px-2 text-sm text-amber-900 hover:underline"
              >
                {t.caseBar.hideLabel}
              </button>
            </div>
          </div>
          <ConfirmationActions
            caseCode={primary.ref.caseCode}
            token={primary.ref.confirmationToken}
            onChanged={onConfirmChanged}
          />
          {expanded && others.length > 0 && (
            <div
              className="mt-3 border-t border-amber-200 pt-2"
              aria-label={t.caseBar.otherCasesLabel}
            >
              <p className="sr-only">{t.caseBar.otherCasesLabel}</p>
              <ul className="flex flex-col gap-2">
                {others.map((entry) => (
                  <li
                    key={entry.ref.caseCode}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white px-3 py-1.5 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-text-primary">
                        {entry.ref.caseCode}
                      </span>
                      <span className="text-text-secondary">
                        {t.caseBar.status[entry.status]}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={localePath(
                          trackPath(entry.ref.caseCode, entry.ref.trackingToken),
                          locale,
                        )}
                        className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-md bg-primary-600 px-3 py-1 text-xs font-semibold text-white hover:bg-primary-700"
                      >
                        {t.caseBar.viewStatus}
                      </a>
                      <button
                        type="button"
                        aria-label={`${t.caseBar.hideLabel} ${entry.ref.caseCode}`}
                        onClick={() => onDismiss(entry, "track")}
                        className="inline-flex items-center px-2 py-1 text-xs text-text-secondary hover:text-text-primary"
                      >
                        {t.caseBar.hideLabel}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <section
      data-testid="my-case-bar"
      aria-label={t.caseBar.regionLabel}
      className="border-b border-border-default bg-primary-50 text-text-primary"
    >
      <div className="mx-auto flex max-w-6xl min-w-0 flex-wrap items-center justify-between gap-2.5 px-4 py-2 sm:px-6">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="break-words text-sm font-semibold text-text-primary sm:text-base">
            {format(t.caseBar.caseSummary, { code: primary.ref.caseCode })}
          </p>
          <span className="inline-flex items-center rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-semibold text-primary-700">
            {t.caseBar.status[primary.status]}
          </span>
          {stale && <span className="text-xs text-text-secondary">{t.caseBar.offlineHint}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={localePath(
              trackPath(primary.ref.caseCode, primary.ref.trackingToken),
              locale,
            )}
            className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-primary-700 active:bg-primary-700"
          >
            {t.caseBar.viewStatus}
          </a>
          {others.length > 0 && (
            <button
              type="button"
              aria-expanded={expanded}
              onClick={onToggleExpanded}
              className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-lg border border-border-default bg-white px-3 py-2 text-sm font-semibold text-text-secondary hover:bg-bg-subtle"
            >
              {format(t.caseBar.moreCases, { count: others.length })}
            </button>
          )}
          <button
            type="button"
            aria-label={t.caseBar.hideLabel}
            onClick={() => onDismiss(primary, "track")}
            className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-lg px-2 text-sm text-text-secondary hover:text-text-primary"
          >
            {t.caseBar.hideLabel}
          </button>
        </div>
        {expanded && others.length > 0 && (
          <div
            className="w-full border-t border-border-default pt-2"
            aria-label={t.caseBar.otherCasesLabel}
          >
            <p className="sr-only">{t.caseBar.otherCasesLabel}</p>
            <ul className="flex flex-col gap-2">
              {others.map((entry) => (
                <li
                  key={entry.ref.caseCode}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white px-3 py-1.5 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-text-primary">
                      {entry.ref.caseCode}
                    </span>
                    <span className="text-text-secondary">
                      {t.caseBar.status[entry.status]}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={localePath(
                        trackPath(entry.ref.caseCode, entry.ref.trackingToken),
                        locale,
                      )}
                      className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-md bg-primary-600 px-3 py-1 text-xs font-semibold text-white hover:bg-primary-700"
                    >
                      {t.caseBar.viewStatus}
                    </a>
                    <button
                      type="button"
                      aria-label={`${t.caseBar.hideLabel} ${entry.ref.caseCode}`}
                      onClick={() => onDismiss(entry, "track")}
                      className="inline-flex items-center px-2 py-1 text-xs text-text-secondary hover:text-text-primary"
                    >
                      {t.caseBar.hideLabel}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function useSafePathname(): string {
  let navPath: string | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    navPath = usePathname();
  } catch {
    navPath = null;
  }
  const [windowPath, setWindowPath] = useState(() =>
    typeof window !== "undefined" ? window.location.pathname : "/",
  );

  useEffect(() => {
    if (navPath) return;
    const update = () => {
      if (typeof window !== "undefined") {
        setWindowPath(window.location.pathname);
      }
    };
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, [navPath]);

  return navPath || windowPath;
}

export function DeviceConfirmationBanner(): ReactElement | null {
  const pathname = useSafePathname();
  const [entries, setEntries] = useState<CaseBarEntry[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return initialCaseBarEntries([...readDeviceCases(window.localStorage)].reverse());
    } catch {
      return [];
    }
  });
  const [stale, setStale] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [revision, setRevision] = useState(0);
  const seqRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (typeof window === "undefined" || document.hidden) return;
      const activeSeq = ++seqRef.current;
      try {
        const result = await syncDeviceCases({
          storage: window.localStorage,
          isCancelled: () => cancelled || seqRef.current !== activeSeq,
        });
        if (cancelled || seqRef.current !== activeSeq) return;
        setEntries(result.entries);
        setStale(result.stale);
      } catch {
        if (!cancelled && seqRef.current === activeSeq) {
          setStale(true);
        }
      }
    }

    void check();

    const timer = window.setInterval(() => void check(), 20_000);
    const refresh = () => void check();

    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("namjaithai:device-cases", refresh);
    window.addEventListener("storage", refresh);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("namjaithai:device-cases", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [revision]);

  const selection = selectCaseBarDisplay(entries, pathname);
  if (!selection) return null;

  const viewedCode = trackedCodeFromPath(pathname);
  const showTrackLinkOnConfirm =
    selection.mode === "confirm" &&
    selection.primary.ref.caseCode.toUpperCase() !== viewedCode;

  const handleToggleExpanded = () => setExpanded((v) => !v);

  const handleDismiss = (entry: CaseBarEntry, mode: "confirm" | "track") => {
    if (typeof window === "undefined") return;
    dismissDeviceCase(
      window.localStorage,
      entry.ref.caseCode,
      mode === "confirm" ? "AWAITING_CONFIRMATION" : "TRACKING",
    );
    try {
      const currentStored = readDeviceCases(window.localStorage);
      setEntries(initialCaseBarEntries([...currentStored].reverse()));
    } catch {
      /* ignore */
    }
  };

  const handleConfirmChanged = () => {
    setRevision((v) => v + 1);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("namjaithai:confirmation-changed"));
      try {
        const currentStored = readDeviceCases(window.localStorage);
        setEntries(initialCaseBarEntries([...currentStored].reverse()));
      } catch {
        /* ignore */
      }
    }
  };

  return (
    <CaseBarView
      selection={selection}
      stale={stale}
      expanded={expanded}
      showTrackLinkOnConfirm={showTrackLinkOnConfirm}
      onToggleExpanded={handleToggleExpanded}
      onDismiss={handleDismiss}
      onConfirmChanged={handleConfirmChanged}
    />
  );
}
