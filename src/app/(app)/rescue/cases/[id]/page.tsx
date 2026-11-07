import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { SignedInShell } from "@/features/auth/components/SignedInShell";
import { requireAccess } from "@/features/auth/server/require-role";
import { TriageTag } from "@/features/cases/components/TriageTag";
import { TriageOverrideForm } from "@/features/cases/components/TriageOverrideForm";
import { CaseContact } from "@/features/rescue/components/CaseContact";
import { CaseWait } from "@/features/rescue/components/CaseWait";
import { createClient } from "@/lib/supabase/server";
import {
  INCIDENT_REGISTRY,
  needLabel,
  openCaseStatusLabel,
  reporterStatusView,
  timelineLabel,
  type CaseStatus,
  type IncidentType,
  type Need,
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
  province: string | null;
  district: string | null;
  subdistrict: string | null;
  landmark: string;
  details: Record<string, unknown>;
};
type Event = {
  id: string;
  event_type: Parameters<typeof timelineLabel>[0];
  to_status: CaseStatus | null;
  created_at: string;
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
  await requireAccess("/rescue/cases");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const supabase = await createClient();
  const { data: item } = await supabase
    .from("cases")
    .select(
      "id, case_code, status, incident_type, urgency, triage_reasons, system_urgency, urgency_override_reason, version, created_at, lat, lng, province, district, subdistrict, landmark, details",
    )
    .eq("id", id)
    .maybeSingle<CaseRow>();
  if (!item) notFound();
  const [permissionResult, eventsResult, sensitiveResult, mediaResult, peopleResult, needsResult] =
    await Promise.all([
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
    ]);
  if (permissionResult.error || !permissionResult.data) notFound();
  const permissions = permissionResult.data as { contact: boolean; override: boolean };
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
        <p>สถานะ: {openCaseStatusLabel[item.status] ?? reporterStatusView(item.status).badge}</p>
        <TriageTag
          urgency={item.urgency}
          reasons={item.triage_reasons ?? []}
          systemUrgency={item.system_urgency}
          overrideReason={item.urgency_override_reason}
        />
        {item.status === "NEW" && <CaseWait createdAt={item.created_at} />}
        <p className="break-words">
          {[item.subdistrict, item.district, item.province, item.landmark]
            .filter(Boolean)
            .join(" · ")}
        </p>
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
