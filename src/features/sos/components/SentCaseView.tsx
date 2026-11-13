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
import { useI18n } from "../../../lib/i18n/I18nProvider";
import { LanguageSwitch } from "../../../components/public/LanguageSwitch";
import { format, localePath } from "../../../lib/i18n/locale";

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

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <LanguageSwitch
        locale={locale}
        path="/sos/sent"
        label={t.common.languageSwitchLabel}
        className="self-end"
      />
      <section className="bg-bg-surface sm:border-border-default rounded-[14px] px-5 py-8 text-center sm:border sm:px-12 sm:py-12">
        <SuccessCheck />

        <h1 className="font-heading text-text-primary mt-6 text-3xl font-bold sm:text-4xl">
          {t.sent.title}
        </h1>
        <p className="text-text-secondary mx-auto mt-3 max-w-lg text-lg">{t.sent.subtitle}</p>

        <div className="border-primary-100 bg-primary-50 mt-8 rounded-[12px] border px-4 py-6">
          <p className="text-primary-700 text-base font-medium">{t.sent.yourCode}</p>
          <p
            className="text-text-primary mt-2 font-mono text-[32px] leading-tight font-bold tracking-[-0.02em] sm:text-[40px]"
            aria-live="polite"
          >
            {sent.caseCode}
          </p>
          <p className="text-text-secondary mt-2 text-base">
            {t.sent.useWithLast4Before}{" "}
            <span className="text-text-primary font-mono font-semibold">{sent.phoneLast4}</span>{" "}
            {t.sent.useWithLast4After}
          </p>
          <button
            type="button"
            onClick={copyCode}
            className="font-heading text-primary-700 hover:bg-primary-100 mt-3 inline-flex min-h-12 items-center gap-2 rounded-full px-5 text-lg font-semibold transition-colors"
          >
            {copied ? <Check className="size-5" /> : <Copy className="size-5" />}
            {copied ? t.sent.copied : t.sent.copyCode}
          </button>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <Link
            href={track}
            className="bg-primary-600 font-heading text-text-on-primary hover:bg-primary-700 flex min-h-14 items-center justify-center rounded-full px-6 text-[19px] font-semibold transition-colors"
          >
            {t.sent.trackStatus}
          </Link>
          <button
            type="button"
            onClick={shareLine}
            className="bg-line-green font-heading flex min-h-14 items-center justify-center gap-3 rounded-full px-6 text-[19px] font-semibold text-white transition-[filter] hover:brightness-95"
          >
            <LineLogo className="size-7" />
            {t.sent.shareLine}
          </button>
        </div>

        <Link
          href={locale === "en" ? "/en/hotlines" : "/"}
          className="font-heading text-primary-700 hover:bg-primary-50 mt-4 inline-flex min-h-12 items-center rounded-full px-5 text-lg font-semibold"
        >
          {t.sent.backHome}
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
