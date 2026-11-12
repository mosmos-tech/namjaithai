"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  capabilityListText,
  INCIDENT_REGISTRY,
  urgencyLabel,
  type IncomingTransfer,
} from "../../../lib/domain";
import { useHydrated } from "../../../lib/use-hydrated";
import { acceptTransfer } from "../actions";
import { transferExpiryText } from "./CaseTransferPanel";

/**
 * คิว "รอรับส่งต่อ" (TF-59) — คำขอที่หน่วยอื่นส่งมาให้หน่วยของเรา ยังไม่มีชื่อ/เบอร์ผู้แจ้งจนกว่าจะรับ
 * กดรับแล้วเคสย้ายมาที่เรา (คนกดเป็นผู้รับเคส) — กดพร้อมกันได้ผลคนเดียว (version ใน accept_transfer)
 */
export function IncomingTransfers({ transfers }: { transfers: IncomingTransfer[] }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (transfers.length === 0 && !message) return null;

  function accept(item: IncomingTransfer) {
    startTransition(async () => {
      const response = await acceptTransfer(item.transfer_id, item.case_version);
      setMessage({ ok: !response.error, text: response.error ?? response.message! });
      if (response.result?.status !== "LIMIT") router.refresh();
    });
  }

  return (
    <section
      aria-labelledby="incoming-transfers-heading"
      className="flex flex-col gap-3 rounded-[14px] border-2 border-amber-400 bg-amber-50 p-4"
      data-testid="incoming-transfers"
    >
      <h2 id="incoming-transfers-heading" className="font-heading text-xl font-semibold">
        รอรับส่งต่อ ({transfers.length})
      </h2>
      {transfers.map((item) => (
        <article
          key={item.transfer_id}
          className="flex flex-col gap-2 rounded-[12px] border bg-white p-4"
          data-testid="incoming-transfer-card"
        >
          <p className="flex flex-wrap items-center gap-x-2 font-semibold">
            <span className="font-mono">{item.case_code}</span>
            <span>{INCIDENT_REGISTRY[item.incident_type]?.label.th ?? "เหตุฉุกเฉิน"}</span>
            <span>· {urgencyLabel[item.urgency]}</span>
          </p>
          <p className="break-words">
            {[item.district, item.province, item.landmark].filter(Boolean).join(" · ")}
          </p>
          <p>
            จากหน่วย {item.from_unit_name} · ต้องใช้:{" "}
            {capabilityListText(item.missing_capabilities)}
          </p>
          <p className="break-words">เหตุผล: {item.reason}</p>
          <p className="text-text-secondary">กดรับภายใน {transferExpiryText(item.expires_at)} น.</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => accept(item)}
              disabled={pending || !hydrated}
              className="bg-primary-600 text-text-on-primary min-h-12 w-full rounded-full px-6 text-lg font-semibold disabled:opacity-50 sm:w-fit"
            >
              {pending ? "กำลังรับเคส…" : "รับเคสส่งต่อ"}
            </button>
            <Link
              href={`/rescue/cases/${item.case_id}`}
              className="border-border-default inline-flex min-h-12 items-center justify-center rounded-full border bg-white px-6 text-lg"
            >
              ดูรายละเอียด
            </Link>
          </div>
        </article>
      ))}
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
