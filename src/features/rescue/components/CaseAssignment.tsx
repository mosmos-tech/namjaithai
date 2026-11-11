"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { assignCase } from "../actions";

export type AssignmentOption = {
  unit_id: string;
  unit_name: string;
  user_id: string;
  display_name: string;
};

export function CaseAssignment({
  caseId,
  version,
  options,
}: {
  caseId: string;
  version: number;
  options: AssignmentOption[];
}) {
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  if (!options.length) return null;
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const [unitId, userId] = selected.split(":");
    if (!unitId || !userId) return;
    startTransition(async () => {
      const result = await assignCase(caseId, unitId, userId, version);
      if (result.error) {
        setMessage({ ok: false, text: result.error });
        if (result.stale) router.refresh();
      } else {
        setMessage({ ok: true, text: "มอบหมายเคสแล้ว" });
        setSelected("");
        router.refresh();
      }
    });
  }
  return (
    <section aria-label="มอบหมายเคส" className="rounded-[14px] border p-4">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-2 text-lg">
          มอบหมายให้สมาชิกในหน่วย
          <select
            required
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            disabled={pending}
            className="border-border-strong min-h-12 rounded-xl border bg-white px-3 text-base"
          >
            <option value="">เลือกสมาชิก</option>
            {options.map((option) => (
              <option
                key={`${option.unit_id}:${option.user_id}`}
                value={`${option.unit_id}:${option.user_id}`}
              >
                {option.display_name} · {option.unit_name}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={pending || !selected}
          className="bg-primary-600 min-h-12 rounded-full px-6 text-lg font-semibold text-white disabled:opacity-50"
          type="submit"
        >
          {pending ? "กำลังมอบหมาย…" : "มอบหมายเคส"}
        </button>
        {message && <p role={message.ok ? "status" : "alert"}>{message.text}</p>}
      </form>
    </section>
  );
}
