"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearSentOfflineSos,
  discardBlockedOfflineSos,
  getOfflineSos,
  processOfflineSos,
  type OfflineSos,
} from "../offline-queue-core";
import { rememberSentCase } from "../sent-case";
import type { IncidentType } from "@/lib/domain/incidents/types";
import { buildSosSmsLinkFromJson } from "@/lib/domain/sms-format";
import { useI18n } from "../../../lib/i18n/I18nProvider";
import { format, localePath } from "../../../lib/i18n/locale";

// TF-36: เบอร์ซิมในเครื่อง SMS gateway — ไม่ได้ตั้ง = ปุ่มเปิดแอปข้อความแบบไม่มีเบอร์ (ส่งให้ญาติเอง)
const SMS_GATEWAY_NUMBER = process.env.NEXT_PUBLIC_SMS_GATEWAY_NUMBER?.trim() ?? "";

type SyncRegistration = ServiceWorkerRegistration & {
  sync?: { register(tag: string): Promise<void> };
};

async function registerBackgroundSync() {
  if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) return;
  const registration = (await navigator.serviceWorker.ready) as SyncRegistration;
  await registration.sync?.register("namjaithai-sos-queue");
}

export function OfflineSosSupport() {
  const { t, locale } = useI18n();
  const o = t.offline;
  // ข้อความ error จากเซิร์ฟเวอร์เป็นภาษาไทย — หน้าอังกฤษใช้ข้อความกลาง
  const serverText = (text: string | undefined) => (locale === "th" ? text : undefined);
  const [item, setItem] = useState<OfflineSos | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ios =
    typeof navigator !== "undefined" &&
    (/iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
  const running = useRef(false);
  const announced = useRef<string | null>(null);
  const announcedBlocked = useRef<string | null>(null);
  const remembered = useRef<string | null>(null);
  const loaded = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const next = await getOfflineSos();
      setItem(next);
      if (
        next?.caseReceived &&
        next.caseCode &&
        next.trackingToken &&
        remembered.current !== next.id
      ) {
        let phoneLast4 = "";
        let incidentType: IncidentType | undefined;
        try {
          const body = JSON.parse(next.body ?? "{}") as {
            phone?: string;
            incidentType?: IncidentType;
          };
          phoneLast4 = String(body.phone ?? "")
            .replace(/\D/g, "")
            .slice(-4);
          incidentType = body.incidentType;
        } catch {
          /* No contact data. */
        }
        rememberSentCase({
          caseCode: next.caseCode,
          trackingToken: next.trackingToken,
          confirmationToken: next.confirmationToken,
          phoneLast4,
          incidentType,
        });
        remembered.current = next.id;
      }
      if (!loaded.current) {
        loaded.current = true;
        if (next) setOpen(true);
      }
      // TF-66: เซิร์ฟเวอร์ปฏิเสธ (4xx) ห้ามหายเงียบ — เปิดหน้าส่งไม่สำเร็จเต็มจอทันที แม้ส่งจากเบื้องหลัง
      if (
        next?.status === "blocked" &&
        announcedBlocked.current !== `${next.id}:${next.lastAttempt}`
      ) {
        announcedBlocked.current = `${next.id}:${next.lastAttempt}`;
        navigator.vibrate?.([300, 100, 300]);
        setOpen(true);
      }
      if (next?.status === "sent" && announced.current !== next.id) {
        announced.current = next.id;
        if (next.caseCode && next.trackingToken) {
          rememberSentCase({
            caseCode: next.caseCode,
            trackingToken: next.trackingToken,
            confirmationToken: next.confirmationToken,
            phoneLast4: next.phoneLast4 ?? "",
            incidentType: next.incidentType as IncidentType | undefined,
          });
        }
        navigator.vibrate?.([200, 100, 200]);
        setOpen(true);
      }
    } catch {
      // If storage is unavailable, the original form reports that it could not queue.
    }
  }, []);

  const send = useCallback(
    async (manual = false) => {
      if (running.current) return;
      running.current = true;
      setBusy(true);
      try {
        await processOfflineSos(manual);
      } catch {
        void registerBackgroundSync().catch(() => undefined);
      } finally {
        running.current = false;
        setBusy(false);
        await refresh();
      }
    },
    [refresh],
  );

  useEffect(() => {
    const queued = (event: Event) => {
      setOpen(true);
      void refresh();
      void registerBackgroundSync().catch(() => undefined);
      const skipImmediateRetry =
        event instanceof CustomEvent &&
        (event.detail as { skipImmediateRetry?: boolean } | null)?.skipImmediateRetry === true;
      if (navigator.onLine && !skipImmediateRetry) void send();
    };
    const online = () => {
      void send();
    };
    const message = (event: MessageEvent) => {
      if (event.data?.type === "sos-queue-changed") void refresh();
    };
    const controllerChanged = () => {
      void getOfflineSos()
        .then((current) => {
          if (current?.status === "pending") void registerBackgroundSync().catch(() => undefined);
        })
        .catch(() => undefined);
    };
    window.addEventListener("sos-queued", queued);
    window.addEventListener("online", online);
    navigator.serviceWorker?.addEventListener("message", message);
    navigator.serviceWorker?.addEventListener("controllerchange", controllerChanged);
    void Promise.resolve().then(() => {
      void refresh();
      if (navigator.onLine) void send();
    });
    const timer = window.setInterval(() => {
      void refresh();
      if (navigator.onLine) void send();
    }, 10000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("sos-queued", queued);
      window.removeEventListener("online", online);
      navigator.serviceWorker?.removeEventListener("message", message);
      navigator.serviceWorker?.removeEventListener("controllerchange", controllerChanged);
    };
  }, [refresh, send]);

  if (!item) return null;
  const pending = item.status !== "sent";
  const blocked = item.status === "blocked";
  const sms = buildSosSmsLinkFromJson(item.body, SMS_GATEWAY_NUMBER);
  const button =
    "flex min-h-14 w-full items-center justify-center rounded-xl px-5 py-3 text-center text-lg font-semibold";

  return (
    <>
      {pending && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`w-full px-4 py-3 text-center text-lg font-bold text-white ${blocked ? "bg-red-700" : "bg-orange-600"}`}
        >
          {blocked ? o.barBlocked : item.caseReceived ? o.barPhotos : o.barPending}
        </button>
      )}
      {open && (
        <main
          className={`fixed inset-0 z-[100] overflow-y-auto ${blocked ? "bg-red-50" : pending ? "bg-orange-100" : "bg-green-100"}`}
        >
          <div className="mx-auto flex min-h-full max-w-xl flex-col justify-center gap-5 px-5 py-8 text-center">
            {blocked ? (
              <>
                <h1 className="text-3xl font-bold text-red-800">{o.blockedTitle}</h1>
                <p role="alert" className="text-lg font-bold text-red-900">
                  {serverText(item.error) ?? o.blockedDefaultError}
                </p>
                <p className="text-lg text-red-950">{o.blockedHelp}</p>
                <div className="grid grid-cols-2 gap-3">
                  <a className={`${button} bg-red-700 text-white`} href="tel:1669">
                    {t.common.call1669}
                  </a>
                  <a className={`${button} bg-red-700 text-white`} href="tel:1784">
                    {o.call1784}
                  </a>
                </div>
                <a
                  className={`${button} border-2 border-red-700 bg-white text-red-900`}
                  href={sms.href}
                >
                  {o.sendBySms}
                </a>
                <p className="-mt-3 text-sm text-red-950">
                  {sms.toSystem ? o.smsToSystemHint : o.smsToContactHint}
                </p>
                <button
                  className={`${button} border-2 border-red-700 bg-white text-red-900 disabled:opacity-60`}
                  disabled={busy}
                  onClick={() => void send(true)}
                >
                  {busy ? o.retrying : o.retry}
                </button>
                <button
                  className="min-h-14 underline"
                  onClick={() => {
                    void discardBlockedOfflineSos(item.id).then(() => {
                      setOpen(false);
                      void refresh();
                    });
                  }}
                >
                  {o.discard}
                </button>
                <button className="min-h-14 underline" onClick={() => setOpen(false)}>
                  {o.backToSite}
                </button>
              </>
            ) : pending ? (
              <>
                <h1 className="text-3xl font-bold text-orange-900">
                  {item.caseReceived ? o.pendingPhotosTitle : o.pendingTitle}
                </h1>
                <p className="text-lg text-orange-950">{o.pendingHelp}</p>
                {item.caseReceived && (
                  <p className="font-semibold">
                    {format(o.caseCode, { code: item.caseCode ?? "" })}
                  </p>
                )}
                {ios && <p className="font-bold text-orange-950">{o.keepOpen}</p>}
                <p className="text-orange-950">
                  {format(o.lastAttempt, {
                    time: new Date(item.lastAttempt).toLocaleString(
                      locale === "en" ? "en-GB" : "th-TH",
                      { dateStyle: "short", timeStyle: "short" },
                    ),
                  })}
                </p>
                {item.error && (
                  <p role="alert" className="font-bold text-red-800">
                    {format(o.errorSuffix, { error: serverText(item.error) ?? o.genericError })}
                  </p>
                )}
                <button
                  className={`${button} bg-orange-700 text-white disabled:opacity-60`}
                  disabled={busy}
                  onClick={() => void send(true)}
                >
                  {busy ? o.retrying : o.retry}
                </button>
                <a
                  className={`${button} border-2 border-orange-700 bg-white text-orange-900`}
                  href={sms.href}
                >
                  {o.sendBySms}
                </a>
                <p className="-mt-3 text-sm text-orange-950">
                  {sms.toSystem ? o.smsToSystemHint : o.smsToContactHint}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <a className={`${button} bg-red-700 text-white`} href="tel:1669">
                    {t.common.call1669}
                  </a>
                  <a className={`${button} bg-red-700 text-white`} href="tel:1784">
                    {o.call1784}
                  </a>
                </div>
                <button className="min-h-12 underline" onClick={() => setOpen(false)}>
                  {o.backToSite}
                </button>
              </>
            ) : (
              <>
                <h1 className="text-3xl font-bold text-green-900">{o.sentTitle}</h1>
                <p className="text-lg">{o.yourCaseCode}</p>
                <p className="font-mono text-4xl font-bold" aria-live="polite">
                  {item.caseCode}
                </p>
                <p>{o.noteCaseCode}</p>
                {item.photoWarning && (
                  <p role="alert" className="font-semibold text-amber-900">
                    {serverText(item.photoWarning) ?? t.sos.submit.photoFailed}
                  </p>
                )}
                <button
                  className={`${button} bg-green-700 text-white`}
                  onClick={() => {
                    void clearSentOfflineSos(item.id).then(() => {
                      setOpen(false);
                      void refresh();
                    });
                  }}
                >
                  {o.acknowledge}
                </button>
                <a
                  href={localePath("/sos/sent", locale)}
                  className={`${button} border-2 border-green-700 bg-white text-green-900`}
                  onClick={(event) => {
                    event.preventDefault();
                    void clearSentOfflineSos(item.id).then(() => {
                      // The same component runs in both the Pages Router and the App Router.
                      window.location.assign(localePath("/sos/sent", locale));
                    });
                  }}
                >
                  {o.viewAndTrack}
                </a>
              </>
            )}
          </div>
        </main>
      )}
    </>
  );
}
