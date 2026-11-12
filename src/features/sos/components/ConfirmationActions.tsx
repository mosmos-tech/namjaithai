"use client";
import { useState } from "react";
import { forgetDeviceCase } from "../device-cases";
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
        throw new Error(
          response.status === 409
            ? "สถานะเคสเปลี่ยนแล้ว กรุณาโหลดใหม่"
            : "ทำรายการไม่สำเร็จ กรุณาลองอีกครั้ง",
        );
      if (decision === "CONFIRM") {
        try {
          forgetDeviceCase(window.localStorage, caseCode);
        } catch {
          /* storage can be unavailable */
        }
      }
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="rounded-[14px] border-2 border-amber-500 bg-amber-50 p-5"
      aria-label="ยืนยันการช่วยเหลือ"
    >
      <h2 className="font-heading text-xl font-bold">ได้รับความช่วยเหลือแล้วหรือยัง?</h2>
      <p className="mt-2">ทีมแจ้งว่าช่วยเสร็จแล้ว กรุณายืนยันสถานะของคุณ</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          disabled={busy}
          onClick={() => void respond("CONFIRM")}
          className="min-h-12 rounded-full bg-green-700 px-6 font-bold text-white disabled:opacity-50"
        >
          ฉันได้รับความช่วยเหลือแล้ว
        </button>
        <button
          disabled={busy}
          onClick={() => void respond("NOT_RECEIVED")}
          className="min-h-12 rounded-full border border-slate-600 bg-white px-6 font-bold disabled:opacity-50"
        >
          ยังไม่ได้รับ
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
