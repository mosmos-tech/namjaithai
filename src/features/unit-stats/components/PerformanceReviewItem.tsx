"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { reviewCasePerformance } from "../actions";
import type { PendingReview } from "./PerformanceReviewQueue";

const REASON_LABEL: Record<string, string> = {
  REPORTER_IS_MEMBER: "เบอร์ผู้แจ้งตรงกับสมาชิกหน่วยที่ปิดเคส",
  TOO_FAST: "รับเคสถึงช่วยเสร็จไม่ถึง 5 นาที",
  FAR_FROM_SCENE: "ตอนถึงที่เกิดเหตุอยู่ห่างจากเคสเกิน 1 กม.",
};

// TF-28: ข้อมูลประกอบ ไม่ใช่เหตุติดด่าน
const NOTE_LABEL: Record<string, string> = {
  LOCATION_UNAVAILABLE: "ไม่มีข้อมูลตำแหน่งตอนถึงที่เกิดเหตุ",
};

export function PerformanceReviewItem({ item }: { item: PendingReview }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function decide(decision: "APPROVE" | "REJECT") {
    startTransition(async () => {
      const result = await reviewCasePerformance(item.case_id, decision, note);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <li
      className="flex flex-col gap-2 rounded-[12px] border p-3"
      data-testid="performance-review-item"
      aria-label={`เคส ${item.case_code}`}
    >
      <p className="font-mono font-semibold">{item.case_code}</p>
      <p>{item.unit_name}</p>
      <ul className="list-disc pl-5 text-red-800">
        {item.reasons.map((reason) => (
          <li key={reason}>{REASON_LABEL[reason] ?? reason}</li>
        ))}
      </ul>
      {item.notes.length > 0 && (
        <p className="text-text-secondary text-sm" data-testid="performance-review-note">
          ข้อมูลประกอบ: {item.notes.map((note) => NOTE_LABEL[note] ?? note).join(" · ")}
        </p>
      )}
      <label className="flex flex-col gap-1">
        หมายเหตุ (ไม่บังคับ)
        <input
          value={note}
          maxLength={300}
          onChange={(event) => setNote(event.target.value)}
          className="border-border-default min-h-12 rounded-[12px] border px-3"
        />
      </label>
      {error && (
        <p role="alert" className="font-semibold text-red-700">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={pending}
          onClick={() => decide("APPROVE")}
          className="bg-primary-600 text-text-on-primary min-h-12 rounded-full px-6 font-semibold disabled:opacity-50"
        >
          ผ่าน นับเป็นผลงาน
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => decide("REJECT")}
          className="min-h-12 rounded-full border-[1.5px] border-red-600 bg-white px-6 font-semibold text-red-700 disabled:opacity-50"
        >
          ไม่ผ่าน
        </button>
      </div>
    </li>
  );
}
