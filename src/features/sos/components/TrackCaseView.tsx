"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Clock,
  Navigation,
  Phone,
  TriangleAlert,
  Users,
} from "lucide-react";
import {
  caseCodeSchema,
  trackScreen,
  reporterStatusView,
  type CaseStatus,
  type StatusTone,
  type TrackedCase,
} from "@/lib/domain";
import { useTrackedCase } from "../use-tracked-case";
import { TrackLookupForm } from "./TrackLookupForm";
import { ReporterCaseActions } from "./ReporterCaseActions";
import { WaitingAdvice } from "./WaitingAdvice";
import { ReporterAccountConfirmation } from "./ReporterAccountConfirmation";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { LanguageSwitch } from "@/components/public/LanguageSwitch";
import { format, localePath } from "@/lib/i18n/locale";
import {
  agoLabel,
  dateTimeLabel,
  distanceLabel,
  etaLabel,
  timeLabel,
} from "@/lib/i18n/track-format";

// TF-42: แผนที่โหลดแยก (MapLibre หนัก) — ระหว่างโหลด/โหลดไม่ขึ้น แผงล่างใช้ได้ครบ
const LazyTrackMap = dynamic(() => import("./TrackMap"), {
  ssr: false,
  loading: () => <TrackMapLoading />,
});

function TrackMapLoading() {
  const { t } = useI18n();
  return (
    <div className="bg-bg-subtle text-text-secondary flex h-64 items-center justify-center rounded-[14px] text-base sm:h-80">
      {t.track.mapLoading}
    </div>
  );
}

/** นาฬิกาเดินทุก 5 วินาที สำหรับข้อความ "x วินาทีที่แล้ว" */
function useNow(intervalMs = 5_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * หน้าติดตามเคส /track/รหัสเคส?t=token (TF-13)
 * แสดงสถานะ แถบขั้นตอน ทีมที่รับเคส และไทม์ไลน์ ดึงข้อมูลใหม่ทุก 20 วินาที
 * (แผนที่สดอยู่ใน TF-42)
 */
export function TrackCaseView({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { code } = use(params);
  const { t: tokenParam } = use(searchParams);
  const { t, locale } = useI18n();
  const caseCode = caseCodeSchema.safeParse(code);
  const token = typeof tokenParam === "string" ? tokenParam : null;

  // ไม่มี token ในลิงก์ (เช่น พิมพ์ URL เอง) → ให้ยืนยันด้วย 4 ตัวท้าย
  if (!caseCode.success || !token) {
    return (
      <div className="mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-12">
        <LanguageSwitch
          locale={locale}
          path={`/track/${encodeURIComponent(code)}`}
          label={t.common.languageSwitchLabel}
          className="mb-4"
        />
        <h1 className="font-heading text-text-primary text-3xl font-bold">{t.track.title}</h1>
        <p className="text-text-secondary mt-2 text-lg">{t.track.lookupHint}</p>
        <TrackLookupForm initialCode={caseCode.success ? caseCode.data : ""} />
      </div>
    );
  }

  return <TrackedCaseLive caseCode={caseCode.data} token={token} />;
}

function TrackedCaseLive({ caseCode, token }: { caseCode: string; token: string }) {
  const [revision, setRevision] = useState(0);
  const state = useTrackedCase(caseCode, token, revision);
  const { t, locale } = useI18n();
  // ข้อความ error จาก API เป็นภาษาไทย — หน้าอังกฤษแปลตามรหัสสถานะ
  const errorMessage =
    state.kind !== "error"
      ? ""
      : locale === "th"
        ? state.message
        : state.status === 404
          ? t.lookup.notFound
          : state.status === 0
            ? t.lookup.offline
            : state.status === 429
              ? t.lookup.tooMany
              : t.lookup.failed;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-10">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={localePath("/track", locale)}
          aria-label={t.track.back}
          className="bg-bg-surface text-text-primary hover:bg-bg-subtle flex size-12 items-center justify-center rounded-full shadow-sm"
        >
          <ArrowLeft className="size-6" />
        </Link>
        <span className="bg-bg-surface text-text-primary rounded-[12px] px-4 py-2 font-mono text-[17px] font-semibold shadow-sm">
          {caseCode}
        </span>
      </div>
      <LanguageSwitch
        locale={locale}
        path={`/track/${encodeURIComponent(caseCode)}?t=${encodeURIComponent(token)}`}
        label={t.common.languageSwitchLabel}
        className="self-end"
      />

      {state.kind === "loading" && (
        <p className="text-text-secondary py-12 text-center text-lg">{t.track.loading}</p>
      )}

      {state.kind === "error" && (
        <div className="bg-bg-surface rounded-[14px] p-6 text-center">
          <p className="text-text-primary text-lg">{errorMessage}</p>
          <Link
            href={localePath("/track", locale)}
            className="bg-primary-600 font-heading text-text-on-primary hover:bg-primary-700 mt-5 inline-flex min-h-12 items-center rounded-full px-6 text-lg font-semibold"
          >
            {t.track.enterNewCode}
          </Link>
        </div>
      )}

      {state.kind === "ready" && (
        <>
          {state.data.status === "AWAITING_CONFIRMATION" && (
            <ReporterAccountConfirmation
              caseCode={caseCode}
              trackingToken={token}
              onChanged={() => setRevision((value) => value + 1)}
            />
          )}
          <TrackedCaseDetail data={state.data} fetchedAt={state.fetchedAt} stale={state.stale} />
          {/* TF-42: รอทีม = ที่เดิม · กำลังมา = ใต้แผงสถานะ (พับได้) · ถึงแล้วเป็นต้นไป ไม่ต้องแสดง */}
          {trackScreen(state.data.status) === "waiting" && (
            <WaitingAdvice incidentType={state.data.incidentType} />
          )}
          <ReporterCaseActions
            caseCode={caseCode}
            token={token}
            status={state.data.status}
            onChanged={() => setRevision((value) => value + 1)}
          />
        </>
      )}
    </div>
  );
}

const BADGE_TONE: Record<StatusTone, string> = {
  waiting: "bg-amber-50 text-amber-700",
  progress: "bg-primary-50 text-primary-700",
  success: "bg-green-50 text-green-700",
  closed: "bg-bg-nav text-gray-700",
};

function TrackedCaseDetail({
  data,
  fetchedAt,
  stale,
}: {
  data: TrackedCase;
  fetchedAt: Date;
  stale: boolean;
}) {
  const { t, locale } = useI18n();
  const view = { ...reporterStatusView(data.status), ...t.track.status[data.status] };
  const screen = trackScreen(data.status);
  const live = screen === "en_route" || screen === "arrived";
  const now = useNow();
  const area = [data.area.subdistrict, data.area.district, data.area.province]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      {live && data.scene && (
        <section aria-label={t.track.mapRegion}>
          <LazyTrackMap
            scene={data.scene}
            team={
              data.teamLocation ? { lat: data.teamLocation.lat, lng: data.teamLocation.lng } : null
            }
          />
        </section>
      )}
      <section className="bg-bg-surface rounded-[14px] p-5 sm:p-8" data-testid="track-panel">
        <span
          className={`inline-block rounded-[8px] px-3 py-1 text-base font-semibold ${BADGE_TONE[view.tone]}`}
        >
          {view.badge}
        </span>
        <h1 className="font-heading text-text-primary mt-3 text-[28px] leading-tight font-bold sm:text-3xl">
          {view.title}
        </h1>
        <p className="text-text-secondary mt-3 text-lg">{view.description}</p>

        {view.progress && <StatusStepper status={data.status} progress={view.progress} />}

        {data.status === "NEW" && (
          <div className="text-text-primary mt-6 flex gap-3 rounded-[12px] bg-amber-50 p-4 text-lg">
            <TriangleAlert className="mt-1 size-6 shrink-0 text-amber-700" aria-hidden="true" />
            <p>{t.track.waitingTip}</p>
          </div>
        )}

        {/* TF-59: ไม่บอกชื่อหน่วยปลายทางจนกว่าจะรับ — ทีมเดิมยังดูแลอยู่ระหว่างนี้ */}
        {data.transferPending && (
          <div
            role="status"
            data-testid="transfer-pending"
            className="bg-primary-50 text-text-primary mt-6 rounded-[12px] p-4 text-lg"
          >
            <p className="font-semibold">{t.track.transferPending}</p>
            <p className="mt-1">{t.track.transferStillCaring}</p>
          </div>
        )}

        {live && <TeamLiveInfo data={data} screen={screen} now={now} />}

        {data.team && <TeamCard team={data.team} />}

        {data.status === "ON_SITE" && (
          <p className="text-text-secondary mt-4 text-base">{t.track.onSiteConfirmHint}</p>
        )}

        <p className="text-text-secondary mt-6 text-base" data-testid="track-last-updated">
          {stale
            ? t.track.stale
            : format(t.track.lastUpdated, {
                ago: agoLabel(fetchedAt, now, t.track),
                time: timeLabel(fetchedAt, locale),
              })}
        </p>
      </section>

      {screen === "en_route" && <WaitingAdvice incidentType={data.incidentType} collapsible />}

      <section className="bg-bg-surface rounded-[14px] p-5 sm:p-8">
        <details className="group">
          <summary className="font-heading text-primary-700 flex min-h-12 cursor-pointer list-none items-center justify-between text-lg font-semibold [&::-webkit-details-marker]:hidden">
            {t.track.timeline}
            <ChevronRight
              className="size-6 transition-transform group-open:rotate-90"
              aria-hidden="true"
            />
          </summary>
          <ol className="border-primary-100 mt-4 flex flex-col gap-4 border-l-2 pl-5">
            {[...data.timeline].reverse().map((event) => (
              <li key={`${event.type}-${event.at}`} className="relative">
                <span className="bg-primary-600 absolute top-2 -left-[27px] size-3 rounded-full" />
                <p className="text-text-primary text-lg">
                  {event.type === "STATUS_CHANGED" && event.toStatus
                    ? t.track.statusChanged[event.toStatus]
                    : t.track.events[event.type]}
                </p>
                <p className="text-text-secondary text-base">{dateTimeLabel(event.at, locale)}</p>
              </li>
            ))}
          </ol>
        </details>
      </section>

      <section className="bg-bg-surface text-text-secondary rounded-[14px] p-5 text-base sm:p-8">
        <p>{format(t.track.reportedAt, { time: dateTimeLabel(data.createdAt, locale) })}</p>
        {area && <p className="mt-1">{format(t.track.area, { area })}</p>}
        <p className="mt-3">
          {t.track.emergencyBefore}{" "}
          <a href="tel:1669" className="text-primary-700 font-semibold underline">
            1669
          </a>{" "}
          {t.track.emergencyOr}{" "}
          <a href="tel:1784" className="text-primary-700 font-semibold underline">
            1784
          </a>{" "}
          {t.track.emergencyAfter}
        </p>
      </section>
    </>
  );
}

function StatusStepper({
  status,
  progress,
}: {
  status: CaseStatus;
  progress: { done: number; active: boolean };
}) {
  const { t } = useI18n();
  return (
    <ol className="mt-6 grid grid-cols-5" aria-label={t.track.stepsLabel}>
      {t.track.steps.map((label, i) => {
        const done = i < progress.done;
        const active = progress.active && i === progress.done;
        const ActiveIcon = status === "EN_ROUTE" ? Navigation : Clock;
        return (
          <li key={label} className="relative flex flex-col items-center gap-2 text-center">
            {i > 0 && (
              <span
                aria-hidden="true"
                className={`absolute top-[18px] right-1/2 h-1 w-full -translate-y-1/2 ${
                  i <= progress.done ? "bg-green-700" : "bg-border-default"
                }`}
              />
            )}
            <span
              className={`relative z-10 flex size-9 items-center justify-center rounded-full border-2 ${
                done
                  ? "border-green-700 bg-green-700 text-white"
                  : active
                    ? "border-primary-600 bg-primary-50 text-primary-600"
                    : "border-border-strong bg-bg-surface"
              }`}
            >
              {done && <Check className="size-5" aria-hidden="true" />}
              {active && <ActiveIcon className="size-5" aria-hidden="true" />}
            </span>
            <span
              className={`text-sm leading-tight sm:text-base ${
                active ? "text-primary-700 font-semibold" : "text-text-primary"
              }`}
            >
              {label}
              <span className="sr-only">
                {done ? t.track.stepDone : active ? t.track.stepActive : t.track.stepPending}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * TF-42: ตำแหน่งทีมเป็นตัวหนังสือ (ใช้ได้แม้แผนที่ไม่ขึ้น)
 * ไม่มีตำแหน่ง/เก่าเกิน 2 นาที → "ไม่มีตำแหน่งล่าสุด" และไม่คำนวณเวลาจากตำแหน่งเก่า
 */
function TeamLiveInfo({
  data,
  screen,
  now,
}: {
  data: TrackedCase;
  screen: "en_route" | "arrived" | "waiting" | "closed";
  now: number;
}) {
  const { t } = useI18n();
  const location = data.teamLocation;
  if (!location) {
    return (
      <div
        className="bg-bg-subtle text-text-primary mt-6 rounded-[12px] p-4 text-lg"
        data-testid="team-location-missing"
        role="status"
      >
        <p className="font-semibold">{t.track.noLocationTitle}</p>
        <p className="text-text-secondary mt-1 text-base">{t.track.noLocationBody}</p>
      </div>
    );
  }
  return (
    <div
      className="bg-primary-50 text-text-primary mt-6 rounded-[12px] p-4 text-lg"
      data-testid="team-live-info"
    >
      {screen === "en_route" && location.etaMinutes !== undefined ? (
        <p className="font-heading text-2xl font-bold" data-testid="team-eta">
          {format(t.track.eta, { eta: etaLabel(location.etaMinutes, t.track) })}
        </p>
      ) : (
        <p className="font-heading text-2xl font-bold">{t.track.nearby}</p>
      )}
      <p className="mt-1">
        {format(t.track.distance, { distance: distanceLabel(location.distanceM, t.track) })}
      </p>
      <p className="text-text-secondary mt-1 text-base">
        {format(t.track.teamLocationAt, { ago: agoLabel(location.updatedAt, now, t.track) })}
      </p>
    </div>
  );
}

function TeamCard({ team }: { team: NonNullable<TrackedCase["team"]> }) {
  const { t } = useI18n();
  const name = team.unitName ?? t.track.teamFallback;
  return (
    <div className="bg-bg-subtle mt-6 flex items-center gap-4 rounded-[12px] p-4">
      <span className="bg-primary-100 text-primary-700 flex size-12 shrink-0 items-center justify-center rounded-full">
        <Users className="size-6" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-text-secondary text-base">{t.track.teamLabel}</p>
        <p className="font-heading text-text-primary text-xl font-semibold">{name}</p>
      </div>
      {/* TF-42: เบอร์หน่วย (ไม่ใช่เบอร์ส่วนตัวกู้ภัย) หน่วยไม่มีเบอร์ใช้ 1669 — ลิงก์ tel: กดได้เสมอ */}
      <a
        href={`tel:${team.contactPhone ?? "1669"}`}
        aria-label={team.contactPhone ? format(t.track.callTeam, { name }) : t.common.call1669}
        data-testid="team-call"
        className="flex size-14 shrink-0 items-center justify-center rounded-full bg-green-700 text-white hover:brightness-110"
      >
        <Phone className="size-6" aria-hidden="true" />
      </a>
    </div>
  );
}

/** ระหว่างรอ params ของหน้า /track/[code] (Suspense fallback) — TF-63 แสดงตามภาษาของหน้า */
export function TrackLoading() {
  const { t } = useI18n();
  return (
    <div className="text-text-secondary mx-auto max-w-2xl px-4 py-12 text-center text-lg sm:px-6">
      {t.track.loading}
    </div>
  );
}
