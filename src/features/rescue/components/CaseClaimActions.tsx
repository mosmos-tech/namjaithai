"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CASE_RELEASE_REASON_MAX, CASE_RELEASE_REASON_MIN } from "../../../lib/domain";
import { acceptCase, releaseCase } from "../actions";

/**
 * ปุ่มรับเคส / ปล่อยเคส (TF-25) บนหน้ารายละเอียดเคส
 * ฐานข้อมูลตัดสินทุกอย่าง (สิทธิ์ เพดาน 2 เคส กดพร้อมกัน) — ที่นี่แค่แสดงผลและโหลดหน้าใหม่
 * รับสำเร็จแล้วโหลดหน้าใหม่ ปุ่มดูเบอร์และข้อมูลสุขภาพจะขึ้นตามสิทธิ์ใหม่ทันที
 */
export function CaseClaimActions({
  caseId,
  version,
  canAccept,
  canRelease,
}: {
  caseId: string;
  version: number;
  canAccept: boolean;
  canRelease: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [releasing, setReleasing] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  if (!canAccept && !canRelease && !message) return null;

  function accept() {
    startTransition(async () => {
      const response = await acceptCase(caseId, version);
      if ("error" in response) {
        setMessage({ ok: false, text: response.error! });
        return;
      }
      setMessage({ ok: response.result.status === "ACCEPTED", text: response.message });
      // TAKEN / STALE: โหลดใหม่ให้เห็นสถานะล่าสุด (ปุ่มรับจะหายไปถ้ามีคนรับแล้ว)
      if (response.result.status !== "LIMIT") router.refresh();
    });
  }

  function release(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const response = await releaseCase(caseId, version, reason);
      if (response.error) {
        setMessage({ ok: false, text: response.error });
        if (response.result) router.refresh();
        return;
      }
      setMessage({ ok: true, text: "ปล่อยเคสแล้ว ระบบกำลังหาทีมใหม่ให้ผู้แจ้ง" });
      setReleasing(false);
      setReason("");
      router.refresh();
    });
  }

  const button =
    "min-h-12 w-full rounded-full px-6 text-lg font-semibold disabled:opacity-50 sm:w-fit";

  return (
    <section className="flex flex-col gap-3 rounded-[14px] border p-4" aria-label="รับหรือปล่อยเคส">
      {canAccept && (
        <button
          type="button"
          onClick={accept}
          disabled={pending}
          className={`${button} bg-primary-600 text-text-on-primary`}
        >
          {pending ? "กำลังรับเคส…" : "รับเคสนี้"}
        </button>
      )}

      {canRelease && !releasing && (
        <button
          type="button"
          onClick={() => setReleasing(true)}
          className={`${button} border-[1.5px] border-red-600 bg-white text-red-700`}
        >
          ปล่อยเคส
        </button>
      )}

      {canRelease && releasing && (
        <form onSubmit={release} className="flex flex-col gap-3" aria-label="ปล่อยเคส">
          <label className="text-text-primary flex flex-col gap-1 text-lg">
            เหตุผลที่ปล่อยเคส (บังคับ)
            <textarea
              required
              minLength={CASE_RELEASE_REASON_MIN}
              maxLength={CASE_RELEASE_REASON_MAX}
              value={reason}
              disabled={pending}
              onChange={(event) => setReason(event.target.value)}
              placeholder="เช่น เรือเสีย ไปไม่ถึงจุดเกิดเหตุ"
              className="border-border-default bg-bg-surface min-h-24 rounded-[12px] border px-4 py-3 text-base"
            />
          </label>
          <p className="text-text-secondary text-sm">
            เคสจะกลับไปรอทีมใหม่ และแจ้งผู้แจ้งว่ากำลังหาทีมใหม่ให้
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="submit" disabled={pending} className={`${button} bg-red-600 text-white`}>
              {pending ? "กำลังปล่อยเคส…" : "ยืนยันปล่อยเคส"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setReleasing(false)}
              className={`${button} border-border-default border bg-white`}
            >
              ยกเลิก
            </button>
          </div>
        </form>
      )}

      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={`text-base font-medium ${message.ok ? "text-green-700" : "text-red-600"}`}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
