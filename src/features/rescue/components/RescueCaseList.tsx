"use client";

import Link from "next/link";
import { LocationAccuracyBadge } from "./LocationAccuracyBadge";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  capabilityListText,
  CaseStatus,
  INCIDENT_REGISTRY,
  RESCUE_RADIUS_OPTIONS_M,
  RescueCaseSort,
  formatDistance,
  formatWaitDuration,
  isLongWait,
  openCaseStatusLabel,
  rescueCaseSortLabel,
  type RescueRadiusM,
  type UnitCapability,
  type UserRole,
} from "@/lib/domain";
import { createClient } from "@/lib/supabase/client";
import { CapabilityFilter } from "@/features/cases/components/CapabilityFilter";
import { TriageTag } from "@/features/cases/components/TriageTag";
import { useCapabilityFilter } from "@/features/cases/use-capability-filter";
import { RescueLiveStatus } from "./RescueLiveStatus";
import { useRescueCasesLive } from "../use-rescue-cases-live";
import {
  fetchRescueCasePage,
  fetchRescueCasePages,
  type RescueCase,
  type RescueCaseCursor,
  type RescueCaseQuery,
} from "../rescue-cases";

type LocationState =
  { kind: "locating" } | { kind: "ready"; lat: number; lng: number } | { kind: "unavailable" };

const controlClass =
  "border-border-strong bg-bg-surface text-text-primary min-h-12 rounded-full border px-4 text-base font-semibold";
const activeControlClass = "border-primary-600 bg-primary-600 text-white";

/**
 * รายการเคสสำหรับกู้ภัย (TF-23)
 * - ข้อมูลจาก list_rescue_cases() ที่ RLS ของผู้ใช้ทำงาน และไม่มีชื่อ/เบอร์/ข้อมูลสุขภาพ
 * - เรียง 3 แบบ, กรองรัศมีจากตำแหน่งตัวเอง (ไม่อนุญาต GPS → จังหวัดของหน่วย), โหลดเพิ่มทีละ 100 แบบ keyset
 * - ตัวกรองความสามารถหน่วย (TF-52) กรองแค่บนหน้าจอ ไม่ได้ซ่อนเคสในฐานข้อมูล
 */
export function RescueCaseList({
  capabilities,
  userRole,
}: {
  capabilities: UnitCapability[];
  userRole: UserRole;
}) {
  const [location, setLocation] = useState<LocationState>(() =>
    // เช็ก window ไม่ใช่ navigator: Node.js มี navigator ฝั่งเซิร์ฟเวอร์แต่ไม่มี geolocation (hydration ไม่ตรง)
    typeof window !== "undefined" && !("geolocation" in navigator)
      ? { kind: "unavailable" }
      : { kind: "locating" },
  );
  const [sort, setSort] = useState<RescueCaseSort>(RescueCaseSort.PRIORITY);
  const [radiusM, setRadiusM] = useState<RescueRadiusM | null>(null);
  const [cases, setCases] = useState<RescueCase[]>([]);
  const [total, setTotal] = useState(0);
  const [next, setNext] = useState<RescueCaseCursor | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedPagesRef = useRef(1);
  const queryRef = useRef<RescueCaseQuery | null>(null);
  const requestSeqRef = useRef(0);
  const activeForegroundLoadsRef = useRef(0);
  const now = useNow();

  // ตำแหน่งของกู้ภัย ใช้คิดระยะทางและรัศมี
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (position) =>
        setLocation({
          kind: "ready",
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }),
      () => setLocation({ kind: "unavailable" }),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);

  const hasLocation = location.kind === "ready";
  const query = useMemo<RescueCaseQuery | null>(() => {
    if (location.kind === "locating") return null;
    return {
      sort: !hasLocation && sort === RescueCaseSort.DISTANCE ? RescueCaseSort.PRIORITY : sort,
      radiusM: hasLocation ? radiusM : null,
      location: location.kind === "ready" ? { lat: location.lat, lng: location.lng } : null,
    };
  }, [location, hasLocation, sort, radiusM]);

  const load = useCallback(
    async (
      q: RescueCaseQuery,
      append: boolean,
      options?: { silent?: boolean },
    ): Promise<boolean> => {
      const seq = ++requestSeqRef.current;
      const foreground = !options?.silent;
      if (foreground) {
        activeForegroundLoadsRef.current += 1;
        setLoading(true);
        setError(null);
      }
      try {
        const page = append
          ? await fetchRescueCasePage(createClient(), q)
          : loadedPagesRef.current > 1
            ? await fetchRescueCasePages(createClient(), q, loadedPagesRef.current)
            : await fetchRescueCasePage(createClient(), q);

        if (seq !== requestSeqRef.current) return false;

        if (append) {
          loadedPagesRef.current += 1;
          setCases((prev) => {
            const seen = new Set(prev.map((item) => item.id));
            return [...prev, ...page.cases.filter((item) => !seen.has(item.id))];
          });
        } else {
          setCases(page.cases);
        }
        setTotal(page.total);
        setNext(page.next);
        setError(null);
        return true;
      } catch {
        if (seq === requestSeqRef.current && foreground) {
          setError("โหลดรายการเคสไม่สำเร็จ กรุณาลองใหม่");
        }
        return false;
      } finally {
        if (foreground) {
          activeForegroundLoadsRef.current = Math.max(0, activeForegroundLoadsRef.current - 1);
          if (activeForegroundLoadsRef.current === 0) {
            setLoading(false);
          }
        }
      }
    },
    [],
  );

  useEffect(() => {
    queryRef.current = query;
    loadedPagesRef.current = 1;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- โหลดใหม่เมื่อเปลี่ยนการเรียง/รัศมี/ตำแหน่ง
    if (query) void load(query, false);
  }, [query, load]);

  const refreshCases = useCallback(async () => {
    const currentQuery = queryRef.current;
    if (!currentQuery) return false;
    return load(currentQuery, false, { silent: true });
  }, [load]);

  const live = useRescueCasesLive({
    role: userRole,
    enabled: query !== null,
    onRefresh: refreshCases,
  });
  const { notifyManualSync } = live;

  const handleManualRefresh = useCallback(async () => {
    if (!query) return;
    const ok = await load(query, false);
    if (ok) notifyManualSync();
  }, [load, notifyManualSync, query]);

  // หน่วยที่ยังไม่ได้ตั้งความสามารถ: ตัวกรองจะซ่อนเกือบทุกเคส จึงไม่เปิดใช้
  const filterAvailable = capabilities.length > 0;
  const filter = useCapabilityFilter(cases, capabilities);
  const shown = filterAvailable ? filter.cases : cases;
  const hiddenCount = cases.length - shown.length;

  return (
    <section aria-labelledby="case-list-heading" className="flex flex-col gap-4">
      <h2 id="case-list-heading" className="sr-only">
        รายการเคส
      </h2>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/rescue/map"
              className="border-border-strong bg-bg-surface text-text-primary hover:bg-bg-subtle inline-flex min-h-12 items-center rounded-full border px-5 text-base font-semibold transition-colors"
            >
              ดูบนแผนที่
            </Link>
            <Link
              href="/rescue/my-tasks"
              className="border-border-strong bg-bg-surface text-text-primary hover:bg-bg-subtle inline-flex min-h-12 items-center rounded-full border px-5 text-base font-semibold transition-colors"
            >
              งานของฉัน
            </Link>
            <RescueLiveStatus mode={live.mode} reason={live.reason} />
          </div>
        </div>

        <div role="group" aria-label="เรียงเคส" className="flex flex-wrap gap-2">
          {Object.values(RescueCaseSort).map((option) => {
            const disabled = option === RescueCaseSort.DISTANCE && !hasLocation;
            const active = (query?.sort ?? sort) === option;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={active}
                disabled={disabled}
                onClick={() => setSort(option)}
                className={`${controlClass} ${active ? activeControlClass : ""} disabled:opacity-40`}
              >
                {rescueCaseSortLabel[option]}
              </button>
            );
          })}
        </div>

        {hasLocation ? (
          <label className="flex min-h-12 flex-wrap items-center gap-3 text-base">
            <span className="font-semibold">รัศมีจากตำแหน่งของคุณ</span>
            <select
              value={radiusM ?? ""}
              onChange={(event) =>
                setRadiusM(
                  event.target.value ? (Number(event.target.value) as RescueRadiusM) : null,
                )
              }
              className="border-border-strong bg-bg-surface min-h-12 rounded-lg border px-3 text-base"
            >
              {RESCUE_RADIUS_OPTIONS_M.map((m) => (
                <option key={m} value={m}>
                  {m / 1000} กม.
                </option>
              ))}
              <option value="">ทั้งหมด</option>
            </select>
          </label>
        ) : (
          location.kind === "unavailable" && (
            <p
              data-testid="location-fallback"
              className="text-text-secondary rounded-[12px] bg-amber-50 px-4 py-3 text-base"
            >
              ไม่ได้รับอนุญาตใช้ตำแหน่ง แสดงเคสในจังหวัดของหน่วยแทน (เรียงตามระยะทางไม่ได้)
            </p>
          )
        )}

        {filterAvailable ? (
          <CapabilityFilter enabled={filter.enabled} onChange={filter.setEnabled} />
        ) : (
          <p className="text-text-secondary text-base">
            หน่วยยังไม่ได้ตั้งความสามารถ จึงแสดงทุกประเภทเหตุ —
            หัวหน้าหน่วยตั้งได้ที่หน้าหน่วยของฉัน
          </p>
        )}
      </div>

      <p
        data-testid="case-count"
        className="text-text-primary text-lg font-semibold"
        aria-live="polite"
      >
        {location.kind === "locating" ? "กำลังหาตำแหน่งของคุณ…" : `พบ ${total} เคสที่ตรงตัวกรอง`}
        {hiddenCount > 0 && (
          <span className="text-text-secondary block text-base font-normal">
            ซ่อน {hiddenCount} เคสที่หน่วยอาจช่วยไม่ได้ (ในที่โหลดแล้ว)
          </span>
        )}
      </p>

      {error && (
        <p role="alert" className="rounded-[12px] bg-red-50 px-4 py-3 text-base text-red-600">
          {error}
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {shown.map((item) => (
          <RescueCaseCard key={item.id} item={item} now={now} />
        ))}
      </ul>

      {!loading && query && shown.length === 0 && !error && (
        <p className="text-text-secondary rounded-[14px] border p-6 text-center text-lg">
          ไม่มีเคสที่ตรงตัวกรอง
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        {next && query && (
          <button
            type="button"
            disabled={loading}
            onClick={() => void load({ ...query, after: next }, true)}
            className={`${controlClass} disabled:opacity-50`}
          >
            {loading ? "กำลังโหลด…" : "โหลดเพิ่ม"}
          </button>
        )}
        {query && (
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleManualRefresh()}
            className={`${controlClass} disabled:opacity-50`}
          >
            รีเฟรช
          </button>
        )}
      </div>
    </section>
  );
}

function RescueCaseCard({ item, now }: { item: RescueCase; now: number }) {
  const waitingMs = now - new Date(item.createdAt).getTime();
  const longWait = isLongWait(waitingMs);
  const people = item.people;
  const totalPeople = people.adults + people.elderly + people.bedridden + people.children;

  return (
    <li
      data-testid="rescue-case-card"
      data-case-code={item.caseCode}
      className="border-border-default bg-bg-surface flex flex-col gap-3 rounded-[14px] border p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-heading text-text-primary text-lg font-semibold">
            {INCIDENT_REGISTRY[item.incident_type]?.label.th ?? item.incident_type}
          </p>
          <p className="text-text-secondary font-mono text-sm">{item.caseCode}</p>
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <span className="bg-bg-subtle text-text-primary rounded-full px-3 py-1 text-sm font-semibold">
            {openCaseStatusLabel[item.status] ?? item.status}
          </span>
          {item.distanceM !== null && (
            <span data-testid="case-distance" className="text-text-primary text-base font-semibold">
              {formatDistance(item.distanceM)}
            </span>
          )}
        </div>
      </div>

      <TriageTag
        urgency={item.urgency}
        reasons={item.triageReasons}
        systemUrgency={item.systemUrgency}
        overrideReason={item.overrideReason}
      />

      <LocationAccuracyBadge source={item.locationSource} accuracyM={item.accuracyM} />

      <div className="flex flex-wrap gap-2 text-sm">
        {item.requiredCapabilities.length > 0 && (
          <span
            data-testid="case-required-capabilities"
            className="bg-primary-50 text-primary-700 rounded-full px-3 py-1 font-semibold"
          >
            ต้องใช้: {capabilityListText(item.requiredCapabilities)}
          </span>
        )}
        {people.bedridden > 0 && (
          <span className="rounded-full bg-red-50 px-3 py-1 font-semibold text-red-600">
            ผู้ป่วยติดเตียง {people.bedridden}
          </span>
        )}
        {people.children > 0 && (
          <span className="rounded-full bg-amber-50 px-3 py-1 font-semibold text-amber-700">
            เด็กเล็ก {people.children}
          </span>
        )}
        {totalPeople > 0 && (
          <span className="bg-bg-subtle text-text-secondary rounded-full px-3 py-1">
            ติดค้าง {totalPeople} คน
          </span>
        )}
      </div>

      <p className="text-text-secondary text-base break-words">
        {[item.area, item.landmark].filter(Boolean).join(" · ")}
      </p>

      {item.status === CaseStatus.NEW && (
        <p
          data-testid="case-wait"
          data-long-wait={longWait}
          className={`text-base font-semibold ${longWait ? "text-red-600" : "text-text-secondary"}`}
        >
          {formatWaitDuration(waitingMs)}
        </p>
      )}
      <Link
        href={`/rescue/cases/${item.id}`}
        className="text-primary-600 inline-flex min-h-12 w-fit items-center font-semibold underline"
      >
        ดูรายละเอียดเคส
      </Link>
    </li>
  );
}

// นาฬิกาที่เดินทุกนาที ให้เวลารออัปเดตเองโดยไม่ต้องโหลดข้อมูลใหม่
function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
