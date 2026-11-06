"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { INCIDENT_REGISTRY, INCIDENT_TYPE_ORDER, type IncidentType } from "@/lib/domain/incidents";

export default function IncidentSelection() {
  const [enabled, setEnabled] = useState<IncidentType[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/situation-summary", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("summary unavailable");
        return response.json();
      })
      .then((data) => {
        if (!Array.isArray(data?.types)) throw new Error("invalid summary");
        setUnavailable(false);
        setEnabled(
          data.types
            .filter((type: { code: IncidentType; enabled: boolean }) => type.enabled)
            .map((type: { code: IncidentType }) => type.code),
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setUnavailable(true);
      });
    return () => controller.abort();
  }, []);
  return (
    <div className="mx-auto max-w-4xl px-5 py-10">
      <h1 className="font-heading text-3xl font-bold">เลือกประเภทเหตุ</h1>
      <p className="text-text-secondary mt-3">เลือกเหตุที่ต้องการความช่วยเหลือ</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {INCIDENT_TYPE_ORDER.map((code) => {
          const available = code === "FLOOD" && (unavailable || enabled.includes(code));
          return available ? (
            <Link
              key={code}
              href="/request"
              className="border-border-default hover:bg-primary-50 flex min-h-16 items-center rounded-xl border bg-white px-5 text-lg font-semibold"
            >
              {INCIDENT_REGISTRY[code].label.th} ›
            </Link>
          ) : (
            <div
              key={code}
              aria-disabled="true"
              className="border-border-default text-text-secondary flex min-h-16 items-center justify-between rounded-xl border bg-slate-50 px-5 text-lg"
            >
              <span>{INCIDENT_REGISTRY[code].label.th}</span>
              <span className="text-sm">ยังไม่เปิดให้แจ้ง</span>
            </div>
          );
        })}
      </div>
      <p className="text-text-secondary mt-6">
        เหตุฉุกเฉินโทร{" "}
        <a href="tel:1669" className="text-primary-700 underline">
          1669
        </a>{" "}
        หรือ{" "}
        <a href="tel:1784" className="text-primary-700 underline">
          1784
        </a>
      </p>
    </div>
  );
}
