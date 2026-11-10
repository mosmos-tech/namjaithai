"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { trackPath } from "@/lib/domain";
import { readDeviceCases } from "../device-cases";
import { ConfirmationActions } from "./ConfirmationActions";

type AccountState = "loading" | "device" | "owner" | "signed_out" | "other" | "error";

export function ReporterAccountConfirmation({
  caseCode,
  trackingToken,
  onChanged,
}: {
  caseCode: string;
  trackingToken: string;
  onChanged: () => void;
}) {
  const [state, setState] = useState<AccountState>("loading");
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        // The device banner already handles cases sent on this device.
        try {
          if (readDeviceCases(window.localStorage).some((item) => item.caseCode === caseCode)) {
            if (!cancelled) setState("device");
            return;
          }
        } catch {
          /* Session confirmation still works without device storage. */
        }
        const response = await fetch(`/api/track/${encodeURIComponent(caseCode)}/confirmation`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error();
        const result = (await response.json()) as { account: AccountState };
        if (!cancelled) setState(result.account);
      } catch {
        if (!cancelled) setState("error");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [caseCode]);

  if (state === "loading" || state === "device") return null;
  if (state === "owner") return <ConfirmationActions caseCode={caseCode} onChanged={onChanged} />;
  if (state === "error")
    return <p role="alert">ตรวจสอบสิทธิ์ยืนยันไม่สำเร็จ กรุณาโหลดหน้าอีกครั้ง</p>;
  const next = trackPath(caseCode, trackingToken);
  return (
    <section
      className="rounded-[14px] border border-amber-400 bg-amber-50 p-5"
      aria-label="ยืนยันด้วยบัญชี LINE"
    >
      <h2 className="font-heading text-xl font-bold">ยืนยันการช่วยเหลือ</h2>
      {state === "signed_out" ? (
        <>
          <p className="mt-2">หากแจ้งเคสขณะเข้าสู่ระบบ LINE ให้ใช้บัญชีเดียวกันเพื่อยืนยัน</p>
          <Link
            className="mt-4 inline-flex min-h-12 items-center rounded-full bg-green-700 px-6 font-bold text-white"
            href={`/auth/line?next=${encodeURIComponent(next)}`}
          >
            เข้าสู่ระบบด้วย LINE
          </Link>
        </>
      ) : (
        <>
          <p className="mt-2">บัญชีนี้ไม่ใช่บัญชีที่ใช้แจ้งเคส กรุณาใช้บัญชี LINE ที่แจ้งเคส</p>
          <form action="/auth/logout" method="post">
            <button className="mt-4 min-h-12 rounded-full border px-6 font-bold" type="submit">
              ออกจากระบบ
            </button>
          </form>
          <p className="mt-2">หลังออกจากระบบ ให้เปิดลิงก์จาก LINE อีกครั้ง</p>
        </>
      )}
    </section>
  );
}
