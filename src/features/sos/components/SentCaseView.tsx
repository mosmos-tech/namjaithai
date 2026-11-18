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
import { WaitingAdvice } from "./WaitingAdvice";
import { REPORTER_ACTIONS_ID } from "./ReporterCaseActions";
import { useI18n } from "../../../lib/i18n/I18nProvider";
import { LanguageSwitch } from "../../../components/public/LanguageSwitch";
import { format, localePath } from "../../../lib/i18n/locale";

/**
 * หน้าส่งสำเร็จ (TF-13 / TF-80): ติ๊กถูก รหัสเคสตัวใหญ่ ปุ่มคัดลอก ติดตามเคส แชร์ LINE
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

/**
 * TF-80: การ์ดรหัสเคสใหญ่ ใช้ทั้งหน้า /sos/sent และเป็นทางสำรองบนหน้าฟอร์ม (เปิดหน้า /sos/sent ไม่ได้ตอนเน็ตหลุด)
 * ปุ่มหลัก "ติดตามเคส" · ปุ่มรอง "กลับหน้าหลัก" และแชร์ LINE · ลิงก์เล็ก "แก้ไขเคส" ไปทางแก้ไขเดิมในหน้าติดตาม
 */
export function SentCaseCard({ sent }: { sent: SentCase }) {
  const { t, locale } = useI18n();
  const [copied, setCopied] = useState(false);
  const track = localePath(trackPath(sent.caseCode, sent.trackingToken), locale);

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
    const url = new URL(track, window.location.origin).href;
    const text =
      locale === "th"
        ? lineShareText(sent.caseCode, url)
        : t.sent.lineShareLines
            .map((line) => format(line, { code: sent.caseCode, url }))
            .join("\n");
    window.location.href = lineShareUrl(text);
  }

  const secondary =
    "font-heading flex min-h-14 items-center justify-center gap-3 rounded-full px-6 text-[19px] font-semibold transition-colors";

  return (
    // TF-80: บนมือถือ (360×640) รหัสเคสและปุ่ม "ติดตามเคส" ต้องอยู่ในจอแรก — ส่วนบนจึงเล็กลงเฉพาะจอเล็ก
    <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-3 sm:gap-6 sm:px-6 sm:py-12">
      <section
        data-testid="sent-case-card"
        className="bg-bg-surface sm:border-border-default relative rounded-[14px] px-4 py-5 text-center sm:border sm:px-12 sm:py-12"
      >
        {/* ปุ่มสลับภาษาอยู่มุมการ์ด ไม่กินแถวของตัวเอง (จอเล็กต้องเห็นปุ่มติดตามเคสในจอแรก) */}
        <LanguageSwitch
          locale={locale}
          path="/sos/sent"
          label={t.common.languageSwitchLabel}
          className="absolute top-3 right-3"
        />
        <SuccessCheck />

        <h1 className="font-heading text-text-primary mt-3 text-2xl font-bold sm:mt-6 sm:text-4xl">
          {t.sent.title}
        </h1>
        <p className="text-text-secondary mx-auto mt-1 max-w-lg text-base sm:mt-3 sm:text-lg">
          {t.sent.subtitle}
        </p>
        {sent.photoWarning && (
          <p
            role="status"
            data-testid="sent-photo-warning"
            className="mx-auto mt-4 max-w-lg rounded-[12px] bg-amber-50 p-3 text-base text-amber-900"
          >
            {sent.photoWarning}
          </p>
        )}

        <div className="border-primary-100 bg-primary-50 mt-4 rounded-[14px] border-2 px-3 py-4 sm:mt-8 sm:py-7">
          <p className="text-primary-700 text-base font-semibold sm:text-lg">{t.sent.yourCode}</p>
          {/* รหัสต้องอยู่บรรทัดเดียวแม้จอ 360px — ขนาดตัวอักษรย่อตามความกว้างจอ */}
          <p
            data-testid="sent-case-code"
            className="text-text-primary mt-2 font-mono text-[clamp(30px,10vw,56px)] leading-none font-bold tracking-[-0.02em] whitespace-nowrap"
            aria-live="polite"
          >
            {sent.caseCode}
          </p>
          <p className="text-text-primary mt-3 text-base font-semibold sm:mt-4 sm:text-lg">
            {t.sent.saveHint}
          </p>
          <button
            type="button"
            onClick={copyCode}
            className="font-heading text-primary-700 hover:bg-primary-100 border-primary-100 mt-3 inline-flex min-h-12 items-center gap-2 rounded-full border bg-white px-5 text-lg font-semibold transition-colors"
          >
            {copied ? <Check className="size-5" /> : <Copy className="size-5" />}
            {copied ? t.sent.copied : t.sent.copyCode}
          </button>
        </div>

        <Link
          href={track}
          className="bg-primary-600 font-heading text-text-on-primary hover:bg-primary-700 mt-4 flex min-h-16 items-center justify-center rounded-full px-6 text-[22px] font-bold transition-colors sm:mt-8"
        >
          {t.sent.trackStatus}
        </Link>
        <p className="text-text-secondary mt-2 text-sm sm:text-base">
          {t.sent.useWithLast4Before}{" "}
          <span className="text-text-primary font-mono font-semibold">{sent.phoneLast4}</span>{" "}
          {t.sent.useWithLast4After}
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Link
            href={locale === "en" ? "/en/hotlines" : "/"}
            className={`${secondary} border-border-strong bg-bg-surface text-text-primary hover:bg-bg-subtle border`}
          >
            {t.sent.backHome}
          </Link>
          <button
            type="button"
            onClick={shareLine}
            className={`${secondary} bg-line-green text-white hover:brightness-95`}
          >
            <LineLogo className="size-7" />
            {t.sent.shareLine}
          </button>
        </div>

        {/* แก้ไขผ่านทางเดิมในหน้าติดตาม (ตรวจเบอร์/เครื่องแล้ว) ไม่เปิดทางใหม่ */}
        <Link
          href={`${track}#${REPORTER_ACTIONS_ID}`}
          className="text-text-secondary hover:text-text-primary mt-5 inline-flex min-h-12 items-center px-4 text-base underline underline-offset-4"
        >
          {t.sent.editCase}
        </Link>
      </section>

      <WaitingAdvice incidentType={sent.incidentType ?? "FLOOD"} />
    </div>
  );
}

// เปิดหน้านี้ตรงๆ หรือจากแท็บใหม่ ไม่มีเคสที่เพิ่งส่งในแท็บนี้
function NoSentCase() {
  const { t, locale } = useI18n();
  return (
    <div className="mx-auto max-w-xl px-4 py-12 text-center sm:px-6">
      <LanguageSwitch
        locale={locale}
        path="/sos/sent"
        label={t.common.languageSwitchLabel}
        className="mb-6"
      />
      <h1 className="font-heading text-text-primary text-3xl font-bold">{t.sent.notFoundTitle}</h1>
      <p className="text-text-secondary mt-3 text-lg">{t.sent.notFoundBody}</p>
      <div className="mt-8 flex flex-col gap-3">
        <Link
          href={localePath("/track", locale)}
          className="bg-primary-600 font-heading text-text-on-primary hover:bg-primary-700 flex min-h-14 items-center justify-center rounded-full px-6 text-[19px] font-semibold"
        >
          {t.sent.trackCase}
        </Link>
        <Link
          href={localePath("/request", locale)}
          className="border-border-strong bg-bg-surface font-heading text-text-primary hover:bg-bg-subtle flex min-h-14 items-center justify-center rounded-full border px-6 text-[19px] font-semibold"
        >
          {t.sent.requestHelp}
        </Link>
      </div>
    </div>
  );
}
