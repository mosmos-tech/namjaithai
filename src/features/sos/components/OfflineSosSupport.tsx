"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearSentOfflineSos,
  getOfflineSos,
  processOfflineSos,
  type OfflineSos,
} from "../offline-queue-core";
import { rememberSentCase } from "../sent-case";
import type { IncidentType } from "@/lib/domain/incidents/types";

type SyncRegistration = ServiceWorkerRegistration & {
  sync?: { register(tag: string): Promise<void> };
};

async function registerBackgroundSync() {
  if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) return;
  const registration = (await navigator.serviceWorker.ready) as SyncRegistration;
  await registration.sync?.register("namjaithai-sos-queue");
}

export function OfflineSosSupport() {
  const [item, setItem] = useState<OfflineSos | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ios =
    typeof navigator !== "undefined" &&
    (/iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
  const running = useRef(false);
  const announced = useRef<string | null>(null);
  const loaded = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const next = await getOfflineSos();
      setItem(next);
      if (!loaded.current) {
        loaded.current = true;
        if (next) setOpen(true);
      }
      if (next?.status === "sent" && announced.current !== next.id) {
        announced.current = next.id;
        if (next.caseCode && next.trackingToken) {
          rememberSentCase({
            caseCode: next.caseCode,
            trackingToken: next.trackingToken,
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
    const queued = () => {
      setOpen(true);
      void refresh();
      void registerBackgroundSync().catch(() => undefined);
      if (navigator.onLine) void send();
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
  let sms = "ขอความช่วยเหลือฉุกเฉิน กรุณาติดต่อกลับ";
  if (item.body) {
    try {
      const body = JSON.parse(item.body) as {
        lat?: number;
        lng?: number;
        phone?: string;
        landmark?: string;
      };
      sms = `ขอความช่วยเหลือฉุกเฉิน พิกัด ${body.lat},${body.lng} จุดสังเกต ${body.landmark ?? ""} โทรกลับ ${body.phone ?? ""}`;
    } catch {
      /* Use the generic message. */
    }
  }
  const button =
    "flex min-h-14 w-full items-center justify-center rounded-xl px-5 py-3 text-center text-lg font-semibold";

  return (
    <>
      {pending && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full bg-orange-600 px-4 py-3 text-center text-lg font-bold text-white"
        >
          มี 1 คำขอรอส่ง — กดดูรายละเอียด
        </button>
      )}
      {open && (
        <main
          className={`fixed inset-0 z-[100] overflow-y-auto ${pending ? "bg-orange-100" : "bg-green-100"}`}
        >
          <div className="mx-auto flex min-h-full max-w-xl flex-col justify-center gap-5 px-5 py-8 text-center">
            {pending ? (
              <>
                <h1 className="text-3xl font-bold text-orange-900">
                  บันทึกไว้ในเครื่องแล้ว — ยังไม่ถึงทีมกู้ภัย
                </h1>
                <p className="text-lg text-orange-950">
                  ระบบจะลองส่งเมื่อกลับมาออนไลน์ หากต้องการความช่วยเหลือด่วนกรุณาโทรสายด่วน
                </p>
                {ios && (
                  <p className="font-bold text-orange-950">เปิดหน้านี้ค้างไว้จนกว่าจะส่งสำเร็จ</p>
                )}
                <p className="text-orange-950">
                  ลองส่งล่าสุด:{" "}
                  {new Date(item.lastAttempt).toLocaleString("th-TH", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </p>
                {item.error && (
                  <p role="alert" className="font-bold text-red-800">
                    {item.error} กรุณาโทรสายด่วนหากยังส่งไม่ได้
                  </p>
                )}
                <button
                  className={`${button} bg-orange-700 text-white disabled:opacity-60`}
                  disabled={busy}
                  onClick={() => void send(true)}
                >
                  {busy ? "กำลังลองส่ง…" : "ลองส่งอีกครั้ง"}
                </button>
                <a
                  className={`${button} border-2 border-orange-700 bg-white text-orange-900`}
                  href={`sms:?body=${encodeURIComponent(sms)}`}
                >
                  ส่งทาง SMS
                </a>
                <div className="grid grid-cols-2 gap-3">
                  <a className={`${button} bg-red-700 text-white`} href="tel:1669">
                    โทร 1669
                  </a>
                  <a className={`${button} bg-red-700 text-white`} href="tel:1784">
                    โทร 1784
                  </a>
                </div>
                <button className="min-h-12 underline" onClick={() => setOpen(false)}>
                  กลับไปหน้าเว็บ
                </button>
              </>
            ) : (
              <>
                <h1 className="text-3xl font-bold text-green-900">
                  ส่งถึงระบบแล้ว รอทีมกู้ภัยรับเคส
                </h1>
                <p className="text-lg">รหัสเคสของคุณ</p>
                <p className="font-mono text-4xl font-bold" aria-live="polite">
                  {item.caseCode}
                </p>
                <p>โปรดจดรหัสเคสและเปิดเสียงโทรศัพท์ไว้</p>
                <button
                  className={`${button} bg-green-700 text-white`}
                  onClick={() => {
                    void clearSentOfflineSos(item.id).then(() => {
                      setOpen(false);
                      void refresh();
                    });
                  }}
                >
                  รับทราบ
                </button>
                <a
                  href="/sos/sent"
                  className={`${button} border-2 border-green-700 bg-white text-green-900`}
                  onClick={(event) => {
                    event.preventDefault();
                    void clearSentOfflineSos(item.id).then(() => {
                      // The same component runs in both the Pages Router and the App Router.
                      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                      window.location.assign("/sos/sent");
                    });
                  }}
                >
                  ดูรายละเอียดและติดตามเคส
                </a>
              </>
            )}
          </div>
        </main>
      )}
    </>
  );
}
