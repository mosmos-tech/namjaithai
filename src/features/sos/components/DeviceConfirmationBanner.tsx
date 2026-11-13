"use client";
import { useEffect, useState } from "react";
import { forgetDeviceCase, readDeviceCases, type DeviceCaseRef } from "../device-cases";
import { ConfirmationActions } from "./ConfirmationActions";
import { useI18n } from "../../../lib/i18n/I18nProvider";
import { format } from "../../../lib/i18n/locale";
export function DeviceConfirmationBanner() {
  const { t } = useI18n();
  const [pending, setPending] = useState<DeviceCaseRef | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (document.hidden) return;
      const entries = readDeviceCases(window.localStorage);
      for (const item of entries) {
        try {
          const response = await fetch(
            `/api/track/${encodeURIComponent(item.caseCode)}?t=${encodeURIComponent(item.trackingToken)}`,
            { cache: "no-store" },
          );
          if (!response.ok) continue;
          const data = await response.json();
          if (cancelled) return;
          if (data.status === "AWAITING_CONFIRMATION") {
            setPending(item);
            return;
          }
          if (["RESOLVED", "CANCELLED", "DUPLICATE", "UNREACHABLE"].includes(data.status))
            forgetDeviceCase(window.localStorage, item.caseCode);
        } catch {
          /* retry when online */
        }
      }
      if (!cancelled) setPending(null);
    }
    void check();
    const timer = window.setInterval(() => void check(), 20_000);
    const refresh = () => void check();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("namjaithai:device-cases", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("namjaithai:device-cases", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [revision]);
  if (!pending) return null;
  return (
    <div className="relative z-[60] mx-auto w-full max-w-2xl px-4 py-3">
      <p className="mb-2 font-semibold">
        {format(t.confirm.deviceCase, { code: pending.caseCode })}
      </p>
      <ConfirmationActions
        caseCode={pending.caseCode}
        token={pending.confirmationToken}
        onChanged={() => {
          setPending(null);
          setRevision((v) => v + 1);
          window.dispatchEvent(new Event("namjaithai:confirmation-changed"));
        }}
      />
    </div>
  );
}
