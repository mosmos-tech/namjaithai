"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  CASE_NOTE_MAX,
  CaseOutcome,
  CaseStatus,
  caseOutcomeLabel,
  INCIDENT_REGISTRY,
  openCaseStatusLabel,
  PEOPLE_HELPED_MAX,
  RESCUER_NEXT_STATUS,
  type IncidentType,
  type Urgency,
} from "../../../lib/domain";
import { addCaseNote, advanceCaseStatus } from "../actions";
import { CaseContact } from "./CaseContact";

export type MyTask = {
  id: string;
  case_code: string;
  status: CaseStatus;
  version: number;
  incident_type: IncidentType;
  urgency: Urgency;
  lat: number;
  lng: number;
  landmark: string;
  district: string | null;
  province: string | null;
  notes: { note: string; created_at: string }[];
};

const bigButton =
  "flex min-h-14 w-full items-center justify-center rounded-full px-6 text-xl font-semibold disabled:opacity-50";

/**
 * การ์ดงานหนึ่งเคสในหน้างานของฉัน (TF-26)
 * - ปุ่มสถานะถัดไปปุ่มเดียว สูง 56px ขึ้นไป: เริ่มเดินทาง → ถึงที่เกิดเหตุ → ช่วยเสร็จแล้ว
 * - ช่วยเสร็จแล้ว: เลือกผล + จำนวนคนที่ช่วยได้ แล้วเคสรอผู้แจ้งยืนยัน (TF-58)
 * - ปุ่มนำทาง ปุ่มดูเบอร์โทร (บันทึก audit แบบ TF-24) และใส่โน้ต
 * ฐานข้อมูลตัดสินสิทธิ์และลำดับทั้งหมด ที่นี่แค่แสดงผลแล้วโหลดหน้าใหม่
 */
export function MyTaskCard({ task }: { task: MyTask }) {
  const router = useRouter();
  const next = RESCUER_NEXT_STATUS[task.status];
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [outcome, setOutcome] = useState<CaseOutcome | null>(null);
  const [peopleHelped, setPeopleHelped] = useState("");
  const [finishNote, setFinishNote] = useState("");
  const [note, setNote] = useState("");
  const area = [task.district, task.province].filter(Boolean).join(" · ");

  function advance(completion?: { outcome: string; peopleHelped: number; note: string }) {
    startTransition(async () => {
      const response = await advanceCaseStatus(task.id, task.version, task.status, completion);
      if (response.error) {
        setMessage({ ok: false, text: response.error });
        // STALE / ลำดับเปลี่ยน: โหลดสถานะล่าสุด
        if (response.result || response.error.includes("สถานะเคสเปลี่ยน")) router.refresh();
        return;
      }
      setMessage({ ok: true, text: response.message! });
      setFinishing(false);
      router.refresh();
    });
  }

  function finish(event: React.FormEvent) {
    event.preventDefault();
    advance({
      outcome: outcome ?? "",
      peopleHelped: peopleHelped === "" ? Number.NaN : Number(peopleHelped),
      note: finishNote,
    });
  }

  function saveNote(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const response = await addCaseNote(task.id, note);
      if (response.error) {
        setMessage({ ok: false, text: response.error });
        return;
      }
      setNote("");
      setMessage({ ok: true, text: "บันทึกโน้ตแล้ว" });
      router.refresh();
    });
  }

  return (
    <article
      data-testid="my-task-card"
      aria-label={`เคส ${task.case_code}`}
      className="bg-bg-surface flex flex-col gap-4 rounded-[14px] border p-4"
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/rescue/cases/${task.id}`}
            className="font-mono text-lg font-semibold underline"
          >
            {task.case_code}
          </Link>
          <p className="text-text-secondary">
            {INCIDENT_REGISTRY[task.incident_type]?.label.th}
            {area && ` · ${area}`}
          </p>
          <p className="break-words">จุดสังเกต: {task.landmark}</p>
        </div>
        <span
          data-testid="my-task-status"
          className="bg-primary-50 text-primary-700 rounded-full px-3 py-1 text-base font-semibold"
        >
          {openCaseStatusLabel[task.status] ?? task.status}
        </span>
      </header>

      {next && !finishing && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            next.to === CaseStatus.AWAITING_CONFIRMATION ? setFinishing(true) : advance()
          }
          className={`${bigButton} bg-primary-600 text-text-on-primary`}
        >
          {pending ? "กำลังบันทึก…" : next.label}
        </button>
      )}

      {task.status === CaseStatus.AWAITING_CONFIRMATION && (
        // TODO(TF-58): ผู้แจ้งยืนยัน / ครบ 24 ชม. / คิวหัวหน้า
        <p className="rounded-[12px] bg-green-50 p-3 text-green-800">
          ช่วยเสร็จแล้ว รอผู้แจ้งยืนยันปิดเคส
        </p>
      )}

      {finishing && (
        <form onSubmit={finish} className="flex flex-col gap-3" aria-label="ช่วยเสร็จแล้ว">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-lg font-semibold">ผลการช่วยเหลือ</legend>
            {Object.values(CaseOutcome).map((value) => (
              <label
                key={value}
                className={`flex min-h-14 items-center gap-3 rounded-[12px] border px-4 text-lg ${
                  outcome === value ? "border-primary-600 bg-primary-50 border-2" : ""
                }`}
              >
                <input
                  type="radio"
                  name={`outcome-${task.id}`}
                  value={value}
                  checked={outcome === value}
                  onChange={() => setOutcome(value)}
                  className="size-5"
                />
                {caseOutcomeLabel[value]}
              </label>
            ))}
          </fieldset>
          <label className="flex flex-col gap-1 text-lg">
            จำนวนคนที่ช่วยได้
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={PEOPLE_HELPED_MAX}
              required
              value={peopleHelped}
              onChange={(event) => setPeopleHelped(event.target.value)}
              className="border-border-default min-h-14 rounded-[12px] border px-4 font-mono text-xl"
            />
          </label>
          <label className="flex flex-col gap-1 text-lg">
            โน้ต {outcome === CaseOutcome.OTHER ? "(บังคับ)" : "(ไม่บังคับ)"}
            <textarea
              maxLength={CASE_NOTE_MAX}
              value={finishNote}
              onChange={(event) => setFinishNote(event.target.value)}
              className="border-border-default min-h-20 rounded-[12px] border px-4 py-3 text-base"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className={`${bigButton} bg-primary-600 text-text-on-primary`}
          >
            {pending ? "กำลังบันทึก…" : "ยืนยัน ช่วยเสร็จแล้ว"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setFinishing(false)}
            className={`${bigButton} border-border-default border bg-white text-lg`}
          >
            ยกเลิก
          </button>
        </form>
      )}

      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={message.ok ? "text-green-700" : "font-semibold text-red-700"}
        >
          {message.text}
        </p>
      )}

      <a
        href={`https://www.google.com/maps/dir/?api=1&destination=${task.lat},${task.lng}`}
        target="_blank"
        rel="noreferrer"
        className={`${bigButton} border-primary-600 text-primary-700 border-2 bg-white text-lg`}
      >
        นำทางไปจุดเกิดเหตุ
      </a>

      <CaseContact caseId={task.id} />

      <form onSubmit={saveNote} className="flex flex-col gap-2" aria-label="ใส่โน้ต">
        <label className="flex flex-col gap-1 text-lg">
          โน้ตระหว่างทำงาน
          <textarea
            maxLength={CASE_NOTE_MAX}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="เช่น ถนนน้ำท่วมสูง อ้อมทางวัด"
            className="border-border-default min-h-20 rounded-[12px] border px-4 py-3 text-base"
          />
        </label>
        <button
          type="submit"
          disabled={pending || note.trim() === ""}
          className={`${bigButton} border-border-strong border bg-white text-lg`}
        >
          บันทึกโน้ต
        </button>
      </form>

      {task.notes.length > 0 && (
        <ul className="text-text-secondary flex flex-col gap-1" aria-label="โน้ตล่าสุด">
          {task.notes.map((item) => (
            <li key={item.created_at} className="break-words">
              • {item.note}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
