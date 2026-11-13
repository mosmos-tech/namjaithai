"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  CASE_TRANSFER_REASON_MAX,
  CASE_TRANSFER_REASON_MIN,
  CASE_TRANSFER_TIMEOUT_MINUTES,
  capabilityListText,
  suggestedMissingCapabilities,
  transferDistanceText,
  UNIT_CAPABILITY_LABELS,
  UnitCapability,
  type IncidentType,
  type PendingTransfer,
  type TransferOption,
} from "../../../lib/domain";
import { useHydrated } from "../../../lib/use-hydrated";
import { acceptTransfer, cancelTransfer, listTransferOptions, requestTransfer } from "../actions";

const button =
  "min-h-12 w-full rounded-full px-6 text-lg font-semibold disabled:opacity-50 sm:w-fit";

export function transferExpiryText(expiresAt: string): string {
  return new Date(expiresAt).toLocaleTimeString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * ส่งต่อเคส (TF-59) บนหน้ารายละเอียดเคส
 * - หน่วยที่ถือเคส: เลือกสิ่งที่ขาด + เหตุผล → ค้นหาหน่วยที่มีครบ (เรียงตามระยะ) → ส่งคำขอ / ยกเลิกคำขอ
 * - หน่วยปลายทาง: ปุ่มรับเคสส่งต่อ
 * ฐานข้อมูลตัดสินสิทธิ์ ส่งต่อซ้อน และกดพร้อมกันทั้งหมด — ที่นี่แค่แสดงผลแล้วโหลดหน้าใหม่
 */
export function CaseTransferPanel({
  caseId,
  version,
  incidentType,
  unitCapabilities,
  canRequest,
  canAccept,
  canCancel,
  pendingTransfer,
}: {
  caseId: string;
  version: number;
  incidentType: IncidentType;
  unitCapabilities: UnitCapability[];
  canRequest: boolean;
  canAccept: boolean;
  canCancel: boolean;
  pendingTransfer: PendingTransfer | null;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [capabilities, setCapabilities] = useState<UnitCapability[]>([]);
  const [reason, setReason] = useState("");
  const [options, setOptions] = useState<TransferOption[] | null>(null);
  const [target, setTarget] = useState("");

  if (!canRequest && !pendingTransfer && !message) return null;
  const suggested = suggestedMissingCapabilities(incidentType, unitCapabilities);
  const busy = pending || !hydrated;

  function toggle(capability: UnitCapability, checked: boolean) {
    setCapabilities((current) =>
      checked ? [...current, capability] : current.filter((item) => item !== capability),
    );
    // เปลี่ยนสิ่งที่ขาด = รายชื่อหน่วยเดิมใช้ไม่ได้แล้ว
    setOptions(null);
    setTarget("");
  }

  function search() {
    startTransition(async () => {
      const response = await listTransferOptions(caseId, capabilities);
      if ("error" in response) {
        setMessage({ ok: false, text: response.error! });
        return;
      }
      setMessage(null);
      setOptions(response.options);
      setTarget(response.options[0]?.unit_id ?? "");
    });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const response = await requestTransfer(caseId, version, target, { capabilities, reason });
      if (response.error) {
        setMessage({ ok: false, text: response.error });
        if (response.result) router.refresh();
        return;
      }
      setMessage({ ok: true, text: response.message! });
      setOpen(false);
      router.refresh();
    });
  }

  function accept() {
    if (!pendingTransfer) return;
    startTransition(async () => {
      const response = await acceptTransfer(pendingTransfer.id, version);
      setMessage({ ok: !response.error, text: response.error ?? response.message! });
      if (response.result?.status !== "LIMIT") router.refresh();
    });
  }

  function cancel() {
    if (!pendingTransfer) return;
    startTransition(async () => {
      const response = await cancelTransfer(pendingTransfer.id);
      setMessage({ ok: !response.error, text: response.error ?? response.message! });
      router.refresh();
    });
  }

  return (
    <section
      className="flex flex-col gap-3 rounded-[14px] border p-4"
      aria-label="ส่งต่อเคส"
      data-testid="case-transfer"
    >
      {pendingTransfer && canAccept && (
        <div className="flex flex-col gap-2" data-testid="incoming-transfer">
          <h3 className="font-heading text-lg font-semibold">
            หน่วย {pendingTransfer.fromUnitName} ขอส่งต่อเคสนี้ให้หน่วยของคุณ
          </h3>
          <p>ต้องใช้: {capabilityListText(pendingTransfer.missingCapabilities)}</p>
          <p className="break-words">เหตุผล: {pendingTransfer.reason}</p>
          <p className="text-text-secondary">
            กดรับภายใน {transferExpiryText(pendingTransfer.expiresAt)} น.
          </p>
          <button
            type="button"
            onClick={accept}
            disabled={busy}
            className={`${button} bg-primary-600 text-text-on-primary`}
          >
            {pending ? "กำลังรับเคส…" : "รับเคสส่งต่อ"}
          </button>
        </div>
      )}

      {pendingTransfer && !canAccept && (
        <div className="flex flex-col gap-2" data-testid="outgoing-transfer">
          <h3 className="font-heading text-lg font-semibold">
            รอหน่วย {pendingTransfer.toUnitName} กดรับ
          </h3>
          <p>
            ต้องใช้: {capabilityListText(pendingTransfer.missingCapabilities)} · หมดเวลา{" "}
            {transferExpiryText(pendingTransfer.expiresAt)} น.
          </p>
          <p className="text-text-secondary">
            ระหว่างนี้หน่วยของคุณยังดูแลเคสนี้ อัปเดตสถานะได้ตามปกติ ถ้าไม่มีใครรับใน{" "}
            {CASE_TRANSFER_TIMEOUT_MINUTES} นาที เคสจะกลับเข้าคิวรอรับพร้อมแท็กอุปกรณ์ที่ต้องใช้
          </p>
          {canCancel && (
            <button
              type="button"
              onClick={cancel}
              disabled={busy}
              className={`${button} border-border-default border bg-white`}
            >
              {pending ? "กำลังยกเลิก…" : "ยกเลิกคำขอส่งต่อ"}
            </button>
          )}
        </div>
      )}

      {canRequest && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={busy}
          className={`${button} border-primary-600 text-primary-700 border-[1.5px] bg-white`}
        >
          ส่งต่อให้หน่วยอื่น
        </button>
      )}

      {canRequest && open && (
        <form onSubmit={submit} className="flex flex-col gap-4" aria-label="ขอส่งต่อเคส">
          <fieldset className="flex flex-col gap-2">
            <legend className="text-lg font-semibold">หน่วยของคุณขาดอะไร (เลือกได้หลายข้อ)</legend>
            {suggested.length > 0 && (
              <p className="text-text-secondary text-sm">
                เหตุนี้มักต้องใช้: {capabilityListText(suggested)}
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.values(UnitCapability).map((capability) => (
                <label
                  key={capability}
                  className="flex min-h-12 items-center gap-3 rounded-lg bg-slate-50 px-3 text-base"
                >
                  <input
                    type="checkbox"
                    className="size-5"
                    checked={capabilities.includes(capability)}
                    disabled={busy}
                    onChange={(event) => toggle(capability, event.target.checked)}
                  />
                  {UNIT_CAPABILITY_LABELS[capability]}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex flex-col gap-1 text-lg">
            เหตุผลที่ส่งต่อ (บังคับ)
            <textarea
              required
              minLength={CASE_TRANSFER_REASON_MIN}
              maxLength={CASE_TRANSFER_REASON_MAX}
              value={reason}
              disabled={busy}
              onChange={(event) => setReason(event.target.value)}
              placeholder="เช่น น้ำสูงเกินเอว ต้องใช้เรือ"
              className="border-border-default bg-bg-surface min-h-24 rounded-[12px] border px-4 py-3 text-base"
            />
          </label>

          <button
            type="button"
            onClick={search}
            disabled={busy || capabilities.length === 0}
            className={`${button} border-primary-600 text-primary-700 border-[1.5px] bg-white`}
          >
            {pending && !options ? "กำลังค้นหา…" : "ค้นหาหน่วยที่มีอุปกรณ์"}
          </button>

          {options && options.length === 0 && (
            <p role="status">ไม่พบหน่วยที่มีครบทุกอย่างที่เลือก ลองเลือกให้น้อยลง</p>
          )}
          {options && options.length > 0 && (
            <fieldset className="flex flex-col gap-2">
              <legend className="text-lg font-semibold">
                เลือกหน่วยที่จะส่งต่อ (ใกล้สุดอยู่บน)
              </legend>
              {options.map((option) => (
                <label
                  key={option.unit_id}
                  className="flex min-h-14 items-start gap-3 rounded-lg border px-3 py-2"
                  data-testid="transfer-option"
                >
                  <input
                    type="radio"
                    name="transfer-target"
                    className="mt-1 size-5"
                    value={option.unit_id}
                    checked={target === option.unit_id}
                    disabled={busy}
                    onChange={() => setTarget(option.unit_id)}
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="font-semibold break-words">{option.unit_name}</span>
                    <span className="text-text-secondary text-sm">
                      {[option.district, option.province].filter(Boolean).join(" ")} ·{" "}
                      {transferDistanceText(option.distance_m, option.is_approximate)}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="submit"
              disabled={busy || !target}
              className={`${button} bg-primary-600 text-text-on-primary`}
            >
              {pending && options ? "กำลังส่งคำขอ…" : "ส่งคำขอส่งต่อ"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setOpen(false)}
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
