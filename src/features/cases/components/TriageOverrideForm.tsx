"use client";

import { useState, useTransition } from "react";
import { Urgency, urgencyLabel } from "../../../lib/domain";
import { overrideCaseUrgencyAction } from "../actions";

const LEVELS: readonly Urgency[] = [Urgency.RED, Urgency.YELLOW, Urgency.GREEN];

/**
 * ฟอร์มให้กู้ภัยปรับระดับความเร่งด่วน (TF-55) — ต้องเลือกระดับใหม่และใส่เหตุผลเสมอ
 * ฐานข้อมูลเช็กสิทธิ์และบันทึก audit_logs ให้ หน้าเคสของกู้ภัย (TF-24) นำไปวาง
 */
export function TriageOverrideForm({
  caseId,
  currentUrgency,
  version,
}: {
  caseId: string;
  currentUrgency: Urgency;
  version: number;
}) {
  const [urgency, setUrgency] = useState<Urgency | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!urgency) {
      setMessage({ ok: false, text: "กรุณาเลือกระดับใหม่" });
      return;
    }
    startTransition(async () => {
      const result = await overrideCaseUrgencyAction({
        caseId,
        urgency,
        reason,
        expectedVersion: version,
      });
      if (result.ok) {
        setMessage({ ok: true, text: "ปรับระดับแล้ว บันทึกเหตุผลไว้ในประวัติ" });
        setUrgency(null);
        setReason("");
      } else {
        setMessage({ ok: false, text: result.fieldErrors?.reason?.[0] ?? result.error });
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" aria-label="ปรับระดับความเร่งด่วน">
      <fieldset className="flex flex-col gap-2" disabled={pending}>
        <legend className="font-heading text-text-primary mb-2 text-lg font-semibold">
          ปรับระดับเป็น
        </legend>
        <div className="flex flex-wrap gap-3">
          {LEVELS.filter((level) => level !== currentUrgency).map((level) => (
            <label
              key={level}
              className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-full border-[1.5px] px-5 text-base font-medium ${
                urgency === level
                  ? "border-primary-600 bg-primary-600 text-text-on-primary"
                  : "border-border-default bg-bg-surface text-text-primary"
              }`}
            >
              <input
                type="radio"
                name="urgency"
                value={level}
                checked={urgency === level}
                onChange={() => setUrgency(level)}
                className="sr-only"
              />
              {urgencyLabel[level]}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="text-text-primary flex flex-col gap-1 text-lg">
        เหตุผล (บังคับ)
        <textarea
          required
          minLength={5}
          maxLength={300}
          value={reason}
          disabled={pending}
          onChange={(event) => setReason(event.target.value)}
          placeholder="เช่น ถึงที่เกิดเหตุแล้ว ผู้ป่วยรู้สึกตัวดี อาการไม่หนัก"
          className="border-border-default bg-bg-surface min-h-24 rounded-[12px] border px-4 py-3 text-base"
        />
      </label>

      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={`text-base font-medium ${message.ok ? "text-green-700" : "text-red-600"}`}
        >
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="bg-primary-600 text-text-on-primary min-h-12 w-fit rounded-full px-6 text-lg font-semibold disabled:opacity-50"
      >
        {pending ? "กำลังบันทึก…" : "บันทึกการปรับระดับ"}
      </button>
    </form>
  );
}
