"use client";
import { useState } from "react";
import { forgetDeviceCase } from "../device-cases";
import { useI18n } from "../../../lib/i18n/I18nProvider";
export function ConfirmationActions({
  caseCode,
  token,
  onChanged,
}: {
  caseCode: string;
  token?: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const { t } = useI18n();
  const [error, setError] = useState("");
  async function respond(decision: "CONFIRM" | "NOT_RECEIVED") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/track/${encodeURIComponent(caseCode)}/confirmation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "X-Confirmation-Token": token } : {}),
        },
        body: JSON.stringify({ decision }),
      });
      if (!response.ok)
        throw new Error(response.status === 409 ? t.confirm.stale : t.confirm.failed);
      if (decision === "CONFIRM") {
        try {
          forgetDeviceCase(window.localStorage, caseCode);
        } catch {
          /* storage can be unavailable */
        }
      }
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.confirm.failed);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="rounded-[14px] border-2 border-amber-500 bg-amber-50 p-5"
      aria-label={t.confirm.regionLabel}
    >
      <h2 className="font-heading text-xl font-bold">{t.confirm.heading}</h2>
      <p className="mt-2">{t.confirm.body}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          disabled={busy}
          onClick={() => void respond("CONFIRM")}
          className="min-h-12 rounded-full bg-green-700 px-6 font-bold text-white disabled:opacity-50"
        >
          {t.confirm.received}
        </button>
        <button
          disabled={busy}
          onClick={() => void respond("NOT_RECEIVED")}
          className="min-h-12 rounded-full border border-slate-600 bg-white px-6 font-bold disabled:opacity-50"
        >
          {t.confirm.notReceived}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
