"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { trackPath } from "@/lib/domain";
import { readDeviceCases } from "../device-cases";
import { ConfirmationActions } from "./ConfirmationActions";
import { useI18n } from "../../../lib/i18n/I18nProvider";
import { localePath } from "../../../lib/i18n/locale";

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
  const { t, locale } = useI18n();
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
  if (state === "error") return <p role="alert">{t.confirm.checkFailed}</p>;
  const next = localePath(trackPath(caseCode, trackingToken), locale);
  return (
    <section
      className="rounded-[14px] border border-amber-400 bg-amber-50 p-5"
      aria-label={t.confirm.lineRegionLabel}
    >
      <h2 className="font-heading text-xl font-bold">{t.confirm.lineHeading}</h2>
      {state === "signed_out" ? (
        <>
          <p className="mt-2">{t.confirm.lineSignedOut}</p>
          <Link
            className="mt-4 inline-flex min-h-12 items-center rounded-full bg-green-700 px-6 font-bold text-white"
            href={`/auth/line?next=${encodeURIComponent(next)}`}
          >
            {t.confirm.lineLogin}
          </Link>
        </>
      ) : (
        <>
          <p className="mt-2">{t.confirm.lineOtherAccount}</p>
          <form action="/auth/logout" method="post">
            <button className="mt-4 min-h-12 rounded-full border px-6 font-bold" type="submit">
              {t.confirm.logout}
            </button>
          </form>
          <p className="mt-2">{t.confirm.reopenFromLine}</p>
        </>
      )}
    </section>
  );
}
