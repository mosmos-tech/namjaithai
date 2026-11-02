"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { trackLookupSchema, trackPath, type TrackedCase } from "@/lib/domain";

/**
 * ฟอร์มเปิดหน้าติดตามด้วย รหัสเคส + เบอร์ 4 ตัวท้าย
 * ส่งแบบ POST เพื่อไม่ให้ 4 ตัวท้ายไปอยู่ใน URL ได้ token กลับมาแล้วพาไป /track/รหัสเคส?t=token
 */
export function TrackLookupForm({ initialCode = "" }: { initialCode?: string }) {
  const router = useRouter();
  const [caseCode, setCaseCode] = useState(initialCode);
  const [phoneLast4, setPhoneLast4] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = trackLookupSchema.safeParse({ caseCode, phoneLast4 });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = (await res.json()) as TrackedCase | { error: string };
      if (!res.ok || "error" in data) {
        setError("error" in data ? data.error : "ดึงข้อมูลเคสไม่สำเร็จ กรุณาลองใหม่");
        return;
      }
      router.replace(trackPath(data.caseCode, data.trackingToken));
    } catch {
      setError("เชื่อมต่ออินเทอร์เน็ตไม่ได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5" noValidate>
      <label className="flex flex-col gap-2">
        <span className="text-text-primary text-base font-medium">รหัสเคส</span>
        <input
          value={caseCode}
          onChange={(e) => setCaseCode(e.target.value)}
          placeholder="FL-2610-0042"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="border-border-strong bg-bg-surface text-text-primary placeholder:text-text-secondary/60 focus:border-primary-600 focus:ring-primary-100 min-h-14 rounded-[12px] border px-4 font-mono text-[22px] font-semibold uppercase placeholder:font-normal focus:ring-3 focus:outline-none"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-text-primary text-base font-medium">เบอร์โทร 4 ตัวท้าย</span>
        <input
          value={phoneLast4}
          onChange={(e) => setPhoneLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="5678"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          className="border-border-strong bg-bg-surface text-text-primary placeholder:text-text-secondary/60 focus:border-primary-600 focus:ring-primary-100 min-h-14 w-40 rounded-[12px] border px-4 font-mono text-[22px] font-semibold tracking-[0.3em] placeholder:font-normal placeholder:tracking-normal focus:ring-3 focus:outline-none"
        />
      </label>

      {error && (
        <p role="alert" className="rounded-[12px] bg-red-50 px-4 py-3 text-base text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="bg-primary-600 font-heading text-text-on-primary hover:bg-primary-700 min-h-14 rounded-full px-6 text-[19px] font-semibold transition-colors disabled:opacity-60"
      >
        {submitting ? "กำลังค้นหา…" : "ดูสถานะเคส"}
      </button>
    </form>
  );
}
