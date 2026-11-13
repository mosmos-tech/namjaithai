"use client";

import { useState } from "react";
import {
  isClosedStatus,
  WATER_LEVEL_DISPLAY_ORDER,
  type WaterLevel,
  type CaseStatus,
} from "@/lib/domain";
import type { ReporterDetails } from "../server/reporter-case";
import { useI18n } from "@/lib/i18n/I18nProvider";

type PeopleKey = "adults" | "elderly" | "bedridden" | "children" | "pets";
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
  const { t, locale } = useI18n();
  const a = t.reporterActions;
  // ข้อความ error จาก API เป็นภาษาไทย — หน้าอังกฤษใช้ข้อความกลาง
  const apiError = (text: string | undefined, fallback: string) =>
    (locale === "th" ? text : undefined) ?? fallback;
  const [details, setDetails] = useState<ReporterDetails | null>(null);
  const [mode, setMode] = useState<"idle" | "edit" | "cancel">("idle");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [phone, setPhone] = useState("");
  const endpoint = `/api/track/${encodeURIComponent(caseCode)}/reporter`;

  async function verifyPhone() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(endpoint, {
        headers: { "X-Tracking-Token": token, "X-Reporter-Phone": phone },
        cache: "no-store",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(apiError(body.error, a.loadFailed));
      setDetails(body);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : a.offline);
    } finally {
      setBusy(false);
    }
  }

  async function save(action: "update" | "cancel") {
    if (!details || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Tracking-Token": token,
          "X-Reporter-Phone": phone,
        },
        body: JSON.stringify(
          action === "cancel" ? { action, version: details.version } : { ...details, action },
        ),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(apiError(body.error, a.saveFailed));
      setMode("idle");
      setDetails(null);
      setPhone("");
      setMessage(action === "cancel" ? a.cancelled : a.saved);
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : a.offline);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bg-bg-surface rounded-[14px] p-5 sm:p-8" aria-label={a.regionLabel}>
      {message && (
        <p role="status" className="text-text-primary mb-4 text-lg">
          {message}
        </p>
      )}
      {!isClosedStatus(status) && (
        <>
          <h2 className="font-heading text-text-primary text-xl font-semibold">{a.heading}</h2>
          {mode === "idle" ? (
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button
                className={`${buttonClass} bg-primary-600 text-white`}
                onClick={() => {
                  setMessage("");
                  setMode("edit");
                }}
              >
                {a.update}
              </button>
              <button
                className={`${buttonClass} border border-green-700 text-green-800`}
                onClick={() => {
                  setMessage("");
                  setMode("cancel");
                }}
              >
                {a.safe}
              </button>
            </div>
          ) : (
            <div className="mt-4">
              {!details && (
                <form
                  className="flex flex-col gap-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    verifyPhone();
                  }}
                >
                  <p className="text-text-secondary text-lg">{a.verifyHint}</p>
                  <label className="text-text-primary text-lg" htmlFor="reporter-phone">
                    {a.phoneLabel}
                  </label>
                  <input
                    id="reporter-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    required
                    maxLength={10}
                    disabled={busy}
                    value={phone}
                    onChange={(event) =>
                      setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))
                    }
                    className={inputClass}
                  />
                  <button
                    className={`${buttonClass} bg-primary-600 text-white`}
                    disabled={busy}
                    type="submit"
                  >
                    {busy ? a.verifying : a.verify}
                  </button>
                </form>
              )}
              {mode === "cancel" && details && (
                <>
                  <h3 className="text-text-primary text-xl font-semibold">{a.confirmSafeTitle}</h3>
                  <p className="text-text-secondary mt-2 text-lg">{a.confirmSafeBody}</p>
                  <button
                    disabled={!details || busy}
                    className={`${buttonClass} mt-4 bg-green-700 text-white`}
                    onClick={() => save("cancel")}
                  >
                    {busy ? a.saving : a.confirmSafe}
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
                    <label htmlFor="reporter-water">{a.waterLevel}</label>
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
                      <option value="">{a.notSpecified}</option>
                      {WATER_LEVEL_DISPLAY_ORDER.map((level) => (
                        <option key={level} value={level}>
                          {a.waterLevels[level]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <fieldset disabled={busy} className="grid min-w-0 grid-cols-2 gap-3">
                    <legend className="text-text-primary mb-2 text-lg">{a.peopleLegend}</legend>
                    {Object.entries(a.people).map(([key, label]) => (
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
                            Number.isNaN(details[key as PeopleKey]) ? "" : details[key as PeopleKey]
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
                    {a.notes}
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
                    {busy ? a.saving : a.save}
                  </button>
                </form>
              )}
              <button
                disabled={busy}
                className={`${buttonClass} text-text-secondary mt-3 underline`}
                onClick={() => {
                  setMode("idle");
                  setDetails(null);
                  setPhone("");
                  setMessage("");
                }}
              >
                {a.backToTracking}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
