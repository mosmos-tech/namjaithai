"use client";

import { useEffect, useState } from "react";
import {
  isClosedStatus,
  waterLevelLabel,
  WATER_LEVEL_DISPLAY_ORDER,
  type WaterLevel,
  type CaseStatus,
} from "@/lib/domain";
import type { ReporterDetails } from "../server/reporter-case";

const peopleLabels = {
  adults: "ผู้ใหญ่",
  elderly: "ผู้สูงอายุ",
  bedridden: "ผู้ป่วยติดเตียง",
  children: "เด็กเล็ก",
  pets: "สัตว์เลี้ยง",
} as const;
const inputClass =
  "border-border-default bg-bg-surface text-text-primary min-h-12 w-full rounded-lg border px-3 text-lg";
const buttonClass = "min-h-12 rounded-full px-5 py-3 text-lg font-semibold disabled:opacity-50";

export function ReporterCaseActions({
  caseCode,
  token,
  status,
  onChanged,
}: {
  caseCode: string;
  token: string;
  status: CaseStatus;
  onChanged: () => void;
}) {
  const [details, setDetails] = useState<ReporterDetails | null>(null);
  const [mode, setMode] = useState<"idle" | "edit" | "cancel">("idle");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const endpoint = `/api/track/${encodeURIComponent(caseCode)}/reporter`;

  useEffect(() => {
    if (mode === "idle") return;
    const controller = new AbortController();
    fetch(endpoint, {
      headers: { "X-Tracking-Token": token },
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "โหลดข้อมูลไม่สำเร็จ");
        setDetails(body);
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setMessage(error.message);
      });
    return () => controller.abort();
  }, [endpoint, token, mode]);

  async function save(action: "update" | "cancel") {
    if (!details || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Tracking-Token": token },
        body: JSON.stringify(
          action === "cancel" ? { action, version: details.version } : { ...details, action },
        ),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "บันทึกไม่สำเร็จ");
      setMode("idle");
      setDetails(null);
      setMessage(action === "cancel" ? "ยกเลิกคำขอแล้ว ขอให้ปลอดภัย" : "บันทึกข้อมูลแล้ว");
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "เชื่อมต่อไม่ได้ กรุณาลองใหม่");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bg-bg-surface rounded-[14px] p-5 sm:p-8" aria-label="จัดการคำขอของคุณ">
      {message && (
        <p role="status" className="text-text-primary mb-4 text-lg">
          {message}
        </p>
      )}
      {!isClosedStatus(status) && (
        <>
          <h2 className="font-heading text-text-primary text-xl font-semibold">
            อัปเดตสถานการณ์ของคุณ
          </h2>
          {mode === "idle" ? (
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button
                className={`${buttonClass} bg-primary-600 text-white`}
                onClick={() => {
                  setMessage("");
                  setMode("edit");
                }}
              >
                อัปเดตข้อมูลเคส
              </button>
              <button
                className={`${buttonClass} border border-green-700 text-green-800`}
                onClick={() => {
                  setMessage("");
                  setMode("cancel");
                }}
              >
                ปลอดภัยแล้ว
              </button>
            </div>
          ) : (
            <div className="mt-4">
              {!details && <p className="text-text-secondary">กำลังโหลดข้อมูล...</p>}
              {mode === "cancel" && (
                <>
                  <h3 className="text-text-primary text-xl font-semibold">ยืนยันว่าปลอดภัยแล้ว?</h3>
                  <p className="text-text-secondary mt-2 text-lg">
                    คำขอจะถูกยกเลิก ทีมกู้ภัยจะเห็นว่าเคสนี้ปิดแล้ว หากยังต้องการความช่วยเหลือ
                    กรุณารอทีมต่อไป
                  </p>
                  <button
                    disabled={!details || busy}
                    className={`${buttonClass} mt-4 bg-green-700 text-white`}
                    onClick={() => save("cancel")}
                  >
                    {busy ? "กำลังบันทึก..." : "ยืนยัน ปลอดภัยแล้ว"}
                  </button>
                </>
              )}
              {mode === "edit" && details && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    save("update");
                  }}
                  className="flex flex-col gap-4"
                >
                  <div className="text-text-primary text-lg">
                    <label htmlFor="reporter-water">ระดับน้ำ</label>
                    <select
                      id="reporter-water"
                      className={`${inputClass} mt-1`}
                      value={details.waterLevel ?? ""}
                      disabled={busy}
                      onChange={(event) =>
                        setDetails({
                          ...details,
                          waterLevel: (event.target.value || null) as WaterLevel | null,
                        })
                      }
                    >
                      <option value="">ไม่ระบุ</option>
                      {WATER_LEVEL_DISPLAY_ORDER.map((level) => (
                        <option key={level} value={level}>
                          {waterLevelLabel[level]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <fieldset disabled={busy} className="grid min-w-0 grid-cols-2 gap-3">
                    <legend className="text-text-primary mb-2 text-lg">จำนวนผู้ติดค้าง</legend>
                    {Object.entries(peopleLabels).map(([key, label]) => (
                      <label key={key} className="text-text-primary min-w-0 text-lg">
                        {label}
                        <input
                          type="number"
                          min="0"
                          max="99"
                          required
                          inputMode="numeric"
                          className={`${inputClass} mt-1`}
                          value={
                            Number.isNaN(details[key as keyof typeof peopleLabels])
                              ? ""
                              : details[key as keyof typeof peopleLabels]
                          }
                          onChange={(event) =>
                            setDetails({
                              ...details,
                              [key]: event.target.value === "" ? NaN : Number(event.target.value),
                            })
                          }
                        />
                      </label>
                    ))}
                  </fieldset>
                  <label className="text-text-primary text-lg">
                    โน้ตเพิ่มเติม
                    <textarea
                      className={`${inputClass} mt-1 min-h-28 py-3`}
                      maxLength={500}
                      value={details.notes}
                      disabled={busy}
                      onChange={(event) => setDetails({ ...details, notes: event.target.value })}
                    />
                  </label>
                  <button
                    disabled={busy}
                    className={`${buttonClass} bg-primary-600 text-white`}
                    type="submit"
                  >
                    {busy ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
                  </button>
                </form>
              )}
              <button
                disabled={busy}
                className={`${buttonClass} text-text-secondary mt-3 underline`}
                onClick={() => {
                  setMode("idle");
                  setDetails(null);
                  setMessage("");
                }}
              >
                กลับไปติดตามเคส
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
