import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { SignedInShell } from "@/features/auth/components/SignedInShell";
import { getCurrentAppUser } from "@/features/auth/server/app-user";
import { TriageTag } from "@/features/cases/components/TriageTag";
import { TriageOverrideForm } from "@/features/cases/components/TriageOverrideForm";
import { CaseClaimActions } from "@/features/rescue/components/CaseClaimActions";
import { CaseAssignment, type AssignmentOption } from "@/features/rescue/components/CaseAssignment";
import { CaseContact } from "@/features/rescue/components/CaseContact";
import { CaseTransferPanel } from "@/features/rescue/components/CaseTransferPanel";
import { getMyUnitCapabilities } from "@/features/rescue/server/my-unit-capabilities";
import { CaseWait } from "@/features/rescue/components/CaseWait";
import { LocationAccuracyBadge } from "@/features/rescue/components/LocationAccuracyBadge";
import { createClient } from "@/lib/supabase/server";
import {
  capabilityListText,
  INCIDENT_REGISTRY,
  needLabel,
  openCaseStatusLabel,
  reporterStatusView,
  timelineLabel,
  type CaseStatus,
  type IncidentType,
  type Need,
  type PendingTransfer,
  type UnitCapability,
  type Urgency,
} from "@/lib/domain";

export const metadata: Metadata = {
  title: "รายละเอียดเคส — น้ำใจไทย SOS",
  robots: { index: false },
};

type CaseRow = {
  id: string;
  case_code: string;
  status: CaseStatus;
  incident_type: IncidentType;
  urgency: Urgency;
  triage_reasons: string[];
  system_urgency: Urgency | null;
  urgency_override_reason: string | null;
  version: number;
  created_at: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  location_source: string | null;
  province: string | null;
  district: string | null;
  subdistrict: string | null;
  landmark: string;
  details: Record<string, unknown>;
  reporter_locale: "th" | "en";
};
type Event = {
  id: string;
  event_type: Parameters<typeof timelineLabel>[0];
  to_status: CaseStatus | null;
  created_at: string;
};

// TF-74: รายงานเพิ่มเติม (case_reporter_supplements.report)
type Supplement = {
  id: string;
  created_at: string;
  report: {
    adults?: number;
    elderly?: number;
    bedridden?: number;
    children?: number;
    pets?: number;
    needs?: Need[];
    otherDetail?: string;
    landmark?: string;
    notes?: string;
    distanceM?: number;
  };
};

export default function Page({ params }: PageProps<"/rescue/cases/[id]">) {
  return (
    <Suspense fallback={<p className="p-8 text-center">กำลังโหลด…</p>}>
      <SignedInShell pathname="/rescue/cases" title="รายละเอียดเคส" denied={Promise.resolve(false)}>
        <Detail params={params} />
      </SignedInShell>
    </Suspense>
  );
}

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  // SignedInShell ตรวจสิทธิ์และ redirect ให้แล้ว — ที่นี่แค่อ่านผู้ใช้ ห้าม redirect ซ้ำกลางการวาดหน้า
  // (redirect ซ้ำทำให้หน้าโหลดวนตอนเปิดพร้อมกันหลายคน แบบเดียวกับที่เคยเกิดกับ /unit)
  const user = await getCurrentAppUser();
  if (!user) return null;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const supabase = await createClient();
  const { data: item } = await supabase
    .from("cases")
    .select(
      "id, case_code, status, incident_type, urgency, triage_reasons, system_urgency, urgency_override_reason, version, created_at, lat, lng, accuracy_m, location_source, province, district, subdistrict, landmark, details, reporter_locale",
    )
    .eq("id", id)
    .maybeSingle<CaseRow>();
  if (!item) notFound();
  const [
    permissionResult,
    eventsResult,
    sensitiveResult,
    mediaResult,
    peopleResult,
    needsResult,
    supplementsResult,
  ] = await Promise.all([
      supabase.rpc("case_detail_permissions", { p_case_id: id }),
      supabase
        .from("case_events")
        .select("id, event_type, to_status, created_at")
        .eq("case_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("case_sensitive_details")
        .select("details")
        .eq("case_id", id)
        .maybeSingle<{ details: Record<string, unknown> }>(),
      supabase.from("case_media").select("id, storage_path").eq("case_id", id),
      supabase
        .from("case_people")
        .select("adults, elderly, bedridden, children, pets")
        .eq("case_id", id)
        .maybeSingle<{
          adults: number;
          elderly: number;
          bedridden: number;
          children: number;
          pets: number;
        }>(),
      supabase.from("case_needs").select("need, other_detail").eq("case_id", id),
      // TF-74: รายงานเพิ่มเติมจากเบอร์เดิมที่ส่งจากเครื่องอื่น — RLS ให้เห็นเฉพาะทีมที่รับเคสและแอดมิน
      supabase
        .from("case_reporter_supplements")
        .select("id, report, created_at")
        .eq("case_id", id)
        .order("created_at", { ascending: true }),
    ]);
  if (permissionResult.error || !permissionResult.data) notFound();
  const permissions = permissionResult.data as {
    contact: boolean;
    override: boolean;
    accept: boolean;
    release: boolean;
    // TF-59
    transfer: boolean;
    acceptTransfer: boolean;
    cancelTransfer: boolean;
    pendingTransfer: PendingTransfer | null;
    requiredCapabilities: UnitCapability[];
  };
  const unitCapabilities = permissions.transfer ? await getMyUnitCapabilities(user.id) : [];
  const assignmentOptions = await supabase.rpc("case_assignment_options", { p_case_id: id });
  const incident = INCIDENT_REGISTRY[item.incident_type];
  const sensitive = sensitiveResult.data?.details ?? null;
  const answers =
    incident?.questions.flatMap((q) => {
      const value = (q.sensitive ? sensitive : item.details)?.[q.key];
      if (value === undefined || value === null) return [];
      const label =
        q.kind === "boolean"
          ? value
            ? "ใช่"
            : "ไม่ใช่"
          : q.kind === "choice"
            ? (q.options.find((option) => option.value === value)?.label.th ?? String(value))
            : String(value);
      return [{ label: q.label.th, value: label }];
    }) ?? [];
  const dangerSigns =
    sensitive && Array.isArray(sensitive.dangerSigns)
      ? sensitive.dangerSigns.flatMap((code: unknown) => {
          const sign = incident?.dangerSigns.find((candidate) => candidate.key === code);
          return sign ? [sign.label.th] : [];
        })
      : [];
  const photos = await Promise.all(
    (mediaResult.data ?? []).map(async (media: { id: string; storage_path: string }) => {
      const { data } = await supabase.storage
        .from("case-media")
        .createSignedUrl(media.storage_path, 300);
      return data?.signedUrl ? { id: media.id, url: data.signedUrl } : null;
    }),
  );
  const visiblePhotos = photos.filter(
    (photo): photo is { id: string; url: string } => photo !== null,
  );
  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/rescue/cases"
        className="text-primary-600 inline-flex min-h-12 w-fit items-center underline"
      >
        ← กลับรายการเคส
      </Link>
      <section className="flex flex-col gap-3 rounded-[14px] border p-4">
        <h2 className="font-heading text-xl font-semibold">
          {incident?.label.th ?? "เหตุฉุกเฉิน"}
        </h2>
        <p className="font-mono">{item.case_code}</p>
        {/* TF-63: ผู้แจ้งกรอกฟอร์มภาษาอังกฤษ (นักท่องเที่ยว) — โทรหาควรเตรียมพูดภาษาอังกฤษ */}
        {item.reporter_locale === "en" && (
          <p
            data-testid="reporter-locale-badge"
            className="w-fit rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-900"
          >
            ผู้แจ้งใช้ภาษาอังกฤษ
          </p>
        )}
        <p>สถานะ: {openCaseStatusLabel[item.status] ?? reporterStatusView(item.status).badge}</p>
        <TriageTag
          urgency={item.urgency}
          reasons={item.triage_reasons ?? []}
          systemUrgency={item.system_urgency}
          overrideReason={item.urgency_override_reason}
        />
        {permissions.requiredCapabilities.length > 0 && (
          <p className="font-semibold" data-testid="required-capabilities">
            ต้องใช้: {capabilityListText(permissions.requiredCapabilities)}
          </p>
        )}
        {item.status === "NEW" && <CaseWait createdAt={item.created_at} />}
        <CaseClaimActions
          caseId={item.id}
          version={item.version}
          canAccept={permissions.accept}
          canRelease={permissions.release}
        />
        <CaseTransferPanel
          caseId={item.id}
          version={item.version}
          incidentType={item.incident_type}
          unitCapabilities={unitCapabilities}
          canRequest={permissions.transfer}
          canAccept={permissions.acceptTransfer}
          canCancel={permissions.cancelTransfer}
          pendingTransfer={permissions.pendingTransfer}
        />
        <CaseAssignment caseId={item.id} version={item.version} options={(assignmentOptions.data ?? []) as AssignmentOption[]} />
        <p className="break-words">
          {[item.subdistrict, item.district, item.province, item.landmark]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <LocationAccuracyBadge source={item.location_source} accuracyM={item.accuracy_m} />
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${item.lat},${item.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-primary-600 inline-flex min-h-12 w-fit items-center rounded-full px-5 font-semibold text-white"
        >
          นำทางไปจุดเกิดเหตุ
        </a>
      </section>
      <section className="rounded-[14px] border p-4">
        <h2 className="font-heading mb-3 text-xl font-semibold">รายละเอียดเหตุ</h2>
        {answers.length ? (
          <dl className="space-y-2">
            {answers.map((answer) => (
              <div key={answer.label}>
                <dt className="font-semibold">{answer.label}</dt>
                <dd>{answer.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p>ไม่มีคำตอบเพิ่มเติม</p>
        )}
        {dangerSigns.length > 0 && (
          <div className="mt-3">
            <p className="font-semibold">สัญญาณอันตราย</p>
            <ul>
              {dangerSigns.map((sign) => (
                <li key={sign}>• {sign}</li>
              ))}
            </ul>
          </div>
        )}
        {sensitive?.hasDisabled === true && <p className="mt-2">มีผู้พิการ</p>}
      </section>
      {peopleResult.data && (
        <section className="rounded-[14px] border p-4">
          <h2 className="font-heading mb-3 text-xl font-semibold">ผู้ติดค้าง</h2>
          <p>
            ผู้ใหญ่ {peopleResult.data.adults} · ผู้สูงอายุ {peopleResult.data.elderly} ·
            ผู้ป่วยติดเตียง {peopleResult.data.bedridden} · เด็กเล็ก {peopleResult.data.children} ·
            สัตว์เลี้ยง {peopleResult.data.pets}
          </p>
        </section>
      )}
      {(needsResult.data ?? []).length > 0 && (
        <section className="rounded-[14px] border p-4">
          <h2 className="font-heading mb-3 text-xl font-semibold">สิ่งที่ต้องการ</h2>
          <ul>
            {(needsResult.data as { need: Need; other_detail: string | null }[]).map((need) => (
              <li key={need.need}>
                • {needLabel[need.need]}
                {need.other_detail ? `: ${need.other_detail}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}
      {permissions.contact && <CaseContact caseId={item.id} />}
      {permissions.override && (
        <section className="rounded-[14px] border p-4">
          <TriageOverrideForm
            caseId={item.id}
            currentUrgency={item.urgency}
            version={item.version}
          />
        </section>
      )}
      {visiblePhotos.length > 0 && (
        <section className="rounded-[14px] border p-4">
          <h2 className="font-heading mb-3 text-xl font-semibold">รูปประกอบ</h2>
          <div className="grid grid-cols-2 gap-3">
            {visiblePhotos.map((photo) => (
              <a key={photo.id} href={photo.url} target="_blank" rel="noopener noreferrer">
                <Image
                  src={photo.url}
                  alt="รูปประกอบเหตุ"
                  width={500}
                  height={320}
                  unoptimized
                  className="h-40 w-full rounded-lg object-cover"
                />
              </a>
            ))}
          </div>
        </section>
      )}
      {(supplementsResult.data ?? []).length > 0 && (
        <section
          className="rounded-[14px] border border-amber-500/40 bg-amber-50 p-4"
          data-testid="reporter-supplements"
        >
          <h2 className="font-heading mb-1 text-xl font-semibold">รายงานเพิ่มเติมจากผู้แจ้ง</h2>
          <p className="text-text-secondary mb-3 text-sm">
            เบอร์เดียวกับผู้แจ้งส่งข้อมูลใหม่จากอีกเครื่อง ข้อมูลหลักของเคสไม่เปลี่ยน
          </p>
          <ol className="space-y-3">
            {(supplementsResult.data as Supplement[]).map(({ id: supplementId, report, created_at }) => (
              <li key={supplementId} className="rounded-lg bg-white p-3">
                <time className="text-text-secondary text-sm" dateTime={created_at}>
                  {new Date(created_at).toLocaleString("th-TH", {
                    timeZone: "Asia/Bangkok",
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </time>
                <p>
                  ผู้ใหญ่ {report.adults ?? 0} · ผู้สูงอายุ {report.elderly ?? 0} · ผู้ป่วยติดเตียง{" "}
                  {report.bedridden ?? 0} · เด็กเล็ก {report.children ?? 0} · สัตว์เลี้ยง{" "}
                  {report.pets ?? 0}
                </p>
                {(report.needs ?? []).length > 0 && (
                  <p>ต้องการ: {(report.needs ?? []).map((need) => needLabel[need]).join(", ")}</p>
                )}
                {report.otherDetail && <p>อื่นๆ: {report.otherDetail}</p>}
                {report.landmark && <p>จุดสังเกต: {report.landmark}</p>}
                {report.notes && <p>ข้อความ: {report.notes}</p>}
                {typeof report.distanceM === "number" && (
                  <p className="text-text-secondary text-sm">
                    ส่งจากจุดที่ห่างจากเคสนี้ {report.distanceM.toLocaleString("th-TH")} ม.
                  </p>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
      <section className="rounded-[14px] border p-4">
        <h2 className="font-heading mb-3 text-xl font-semibold">ไทม์ไลน์</h2>
        {(eventsResult.data ?? []).length ? (
          <ol className="space-y-3">
            {(eventsResult.data as Event[]).map((event) => (
              <li key={event.id}>
                <p>{timelineLabel(event.event_type, event.to_status)}</p>
                <time className="text-text-secondary text-sm" dateTime={event.created_at}>
                  {new Date(event.created_at).toLocaleString("th-TH", {
                    timeZone: "Asia/Bangkok",
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </time>
              </li>
            ))}
          </ol>
        ) : (
          <p>ยังไม่มีประวัติ</p>
        )}
      </section>
    </div>
  );
}
