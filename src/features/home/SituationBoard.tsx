"use client";
import { useEffect, useState } from "react";
import { INCIDENT_REGISTRY, type IncidentType } from "@/lib/domain/incidents";

type Province = {
  name: string;
  teams: number;
  waiting: number;
  rescued: number;
  incidents: { code: IncidentType; waiting: number }[];
};
type Summary = { provinces: Province[]; generatedAt: string };

export function SituationBoard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [province, setProvince] = useState("กรุงเทพมหานคร");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    let controller: AbortController | undefined;
    async function refresh() {
      controller?.abort();
      if (!navigator.onLine) {
        if (alive) {
          setSummary(null);
          setLoading(false);
        }
        return;
      }
      controller = new AbortController();
      try {
        const response = await fetch("/api/situation-summary", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("summary unavailable");
        const body = (await response.json()) as Summary;
        if (alive) {
          setSummary(body);
          setLoading(false);
        }
      } catch (error) {
        if (alive && !(error instanceof DOMException && error.name === "AbortError")) {
          setSummary(null);
          setLoading(false);
        }
      }
    }
    const offline = () => {
      controller?.abort();
      setSummary(null);
      setLoading(false);
    };
    void refresh();
    const interval = setInterval(refresh, 30_000);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", offline);
    return () => {
      alive = false;
      controller?.abort();
      clearInterval(interval);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", offline);
    };
  }, []);
  const selected = summary?.provinces.find((item) => item.name === province);
  return (
    <section aria-labelledby="situation-heading" className="rounded-xl bg-blue-800 p-6 text-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-400 pb-4">
        <h2 id="situation-heading" className="font-heading text-lg font-semibold">
          ● สถานการณ์ตอนนี้
        </h2>
        {summary && (
          <label className="flex items-center gap-2 text-sm">
            จังหวัด{" "}
            <select
              aria-label="เลือกจังหวัด"
              value={province}
              onChange={(event) => setProvince(event.target.value)}
              className="min-h-12 max-w-48 rounded-lg bg-white px-2 text-slate-900"
            >
              {summary.provinces.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {selected ? (
        <>
          {[
            ["ทีมกู้ภัยออนไลน์", selected.teams, "ทีม"],
            ["เคสที่รอความช่วยเหลือ", selected.waiting, "เคส"],
            ["ช่วยออกมาได้แล้ววันนี้", selected.rescued, "คน"],
          ].map(([label, count, unit]) => (
            <div
              key={label}
              className="flex items-center justify-between gap-3 border-b border-blue-400 py-4"
            >
              <span>{label}</span>
              <span>
                <strong className="font-mono text-3xl">{count}</strong> {unit}
              </span>
            </div>
          ))}
          <h3 className="mt-4 font-semibold">เคสรอช่วยตามประเภทเหตุ</h3>
          <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {selected.incidents.map((item) => (
              <li className="flex justify-between gap-2" key={item.code}>
                <span>{INCIDENT_REGISTRY[item.code]?.label.th ?? item.code}</span>
                <span>{item.waiting}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-blue-100">ข้อมูลอัปเดตทุก 30 วินาที</p>
        </>
      ) : (
        <p role="status" className="py-6">
          {loading ? "กำลังโหลดข้อมูลสถานการณ์…" : "ไม่มีข้อมูลล่าสุด"}
        </p>
      )}
    </section>
  );
}
