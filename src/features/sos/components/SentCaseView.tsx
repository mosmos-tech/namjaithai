"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { Check, Copy } from "lucide-react";
import { LineLogo } from "@/components/public/LineLogo";
import { lineShareText, lineShareUrl, trackPath } from "@/lib/domain";
import {
  getSentCaseServerSnapshot,
  getSentCaseSnapshot,
  subscribeSentCase,
  type SentCase,
} from "../sent-case";
import { SuccessCheck } from "./SuccessCheck";

const WAITING_TIPS = [
  "ขึ้นไปอยู่ที่สูงที่สุดที่ปลอดภัย",
  "สับคัตเอาต์ไฟถ้าน้ำเริ่มเข้าบ้าน",
  "ประหยัดแบตมือถือ ลดแสงหน้าจอ ปิดแอปที่ไม่ใช้",
  "โบกผ้าสีสด หรือใช้ไฟฉายส่งสัญญาณเมื่อได้ยินเสียงเรือ",
];

/**
 * หน้าส่งสำเร็จ (TF-13): ติ๊กถูก รหัสเคสตัวใหญ่ ปุ่มคัดลอก ติดตามเคส แชร์ LINE
 * อ่านเคสที่เพิ่งส่งจาก sessionStorage จึงเห็นรหัสทันทีโดยไม่ต้องรอเน็ต
 */
export function SentCaseView() {
  const sent = useSyncExternalStore(
    subscribeSentCase,
    getSentCaseSnapshot,
    getSentCaseServerSnapshot,
  );

  if (!sent) return <NoSentCase />;
  return <SentCaseCard sent={sent} />;
}

function SentCaseCard({ sent }: { sent: SentCase }) {
  const [copied, setCopied] = useState(false);
  const track = trackPath(sent.caseCode, sent.trackingToken);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(sent.caseCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // เบราว์เซอร์ไม่ให้คัดลอก (เช่น ไม่ใช่ https) ผู้ใช้ยังจดจากหน้าจอได้
    }
  }

  function shareLine() {
    const text = lineShareText(sent.caseCode, new URL(track, window.location.origin).href);
    window.location.href = lineShareUrl(text);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <section className="bg-bg-surface sm:border-border-default rounded-[14px] px-5 py-8 text-center sm:border sm:px-12 sm:py-12">
        <SuccessCheck />

        <h1 className="font-heading text-text-primary mt-6 text-3xl font-bold sm:text-4xl">
          ส่งถึงระบบแล้ว
        </h1>
        <p className="text-text-secondary mx-auto mt-3 max-w-lg text-lg">
          ตอนนี้รอทีมกู้ภัยกดรับเคส อยู่ในที่สูงและเปิดเสียงโทรศัพท์ไว้
        </p>

        <div className="border-primary-100 bg-primary-50 mt-8 rounded-[12px] border px-4 py-6">
          <p className="text-primary-700 text-base font-medium">รหัสเคสของคุณ (จดไว้)</p>
          <p
            className="text-text-primary mt-2 font-mono text-[32px] leading-tight font-bold tracking-[-0.02em] sm:text-[40px]"
            aria-live="polite"
          >
            {sent.caseCode}
          </p>
          <p className="text-text-secondary mt-2 text-base">
            ใช้คู่กับ 4 ตัวท้ายเบอร์โทร{" "}
            <span className="text-text-primary font-mono font-semibold">{sent.phoneLast4}</span>{" "}
            เพื่อติดตามเคส
          </p>
          <button
            type="button"
            onClick={copyCode}
            className="font-heading text-primary-700 hover:bg-primary-100 mt-3 inline-flex min-h-12 items-center gap-2 rounded-full px-5 text-lg font-semibold transition-colors"
          >
            {copied ? <Check className="size-5" /> : <Copy className="size-5" />}
            {copied ? "คัดลอกแล้ว" : "คัดลอกรหัสเคส"}
          </button>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <Link
            href={track}
            className="bg-primary-600 font-heading text-text-on-primary hover:bg-primary-700 flex min-h-14 items-center justify-center rounded-full px-6 text-[19px] font-semibold transition-colors"
          >
            ติดตามสถานะเคส
          </Link>
          <button
            type="button"
            onClick={shareLine}
            className="bg-line-green font-heading flex min-h-14 items-center justify-center gap-3 rounded-full px-6 text-[19px] font-semibold text-white transition-[filter] hover:brightness-95"
          >
            <LineLogo className="size-7" />
            แชร์ให้ญาติทาง LINE
          </button>
        </div>

        <Link
          href="/"
          className="font-heading text-primary-700 hover:bg-primary-50 mt-4 inline-flex min-h-12 items-center rounded-full px-5 text-lg font-semibold"
        >
          กลับหน้าแรก
        </Link>
      </section>

      <section className="border-border-default bg-bg-surface rounded-[14px] border p-5 sm:p-8">
        <h2 className="font-heading text-text-primary text-[22px] font-semibold">
          ระหว่างรอทีมกู้ภัย
        </h2>
        <ul className="mt-4 flex flex-col gap-3">
          {WAITING_TIPS.map((tip) => (
            <li key={tip} className="text-text-primary flex items-start gap-3 text-lg">
              <span className="bg-primary-50 mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full">
                <Check className="text-primary-600 size-4" aria-hidden="true" />
              </span>
              {tip}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// เปิดหน้านี้ตรงๆ หรือจากแท็บใหม่ ไม่มีเคสที่เพิ่งส่งในแท็บนี้
function NoSentCase() {
  return (
    <div className="mx-auto max-w-xl px-4 py-12 text-center sm:px-6">
      <h1 className="font-heading text-text-primary text-3xl font-bold">ไม่พบเคสที่เพิ่งส่ง</h1>
      <p className="text-text-secondary mt-3 text-lg">
        ถ้าคุณแจ้งไว้แล้ว ติดตามได้ด้วยรหัสเคสและเบอร์โทร 4 ตัวท้าย
      </p>
      <div className="mt-8 flex flex-col gap-3">
        <Link
          href="/track"
          className="bg-primary-600 font-heading text-text-on-primary hover:bg-primary-700 flex min-h-14 items-center justify-center rounded-full px-6 text-[19px] font-semibold"
        >
          ติดตามเคส
        </Link>
        <Link
          href="/request"
          className="border-border-strong bg-bg-surface font-heading text-text-primary hover:bg-bg-subtle flex min-h-14 items-center justify-center rounded-full border px-6 text-[19px] font-semibold"
        >
          แจ้งขอความช่วยเหลือ
        </Link>
      </div>
    </div>
  );
}
