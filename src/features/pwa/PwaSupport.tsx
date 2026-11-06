"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

type InstallEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
const DISMISSED_KEY = "namjaithai:pwa-dismissed-at";
const WEEK = 7 * 86400000;

function browserSnapshot() {
  const ios =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  let dismissed = false;
  try {
    const at = Number(localStorage.getItem(DISMISSED_KEY));
    dismissed = at > 0 && Date.now() - at < WEEK;
  } catch {
    /* Storage is optional in private mode. */
  }
  return (ios ? 1 : 0) | (standalone ? 2 : 0) | (dismissed ? 4 : 0) | (!navigator.onLine ? 8 : 0);
}

function subscribeBrowser(listener: () => void) {
  const events = ["online", "offline", "storage", "pwa-dismissed"];
  events.forEach((event) => window.addEventListener(event, listener));
  const media = window.matchMedia("(display-mode: standalone)");
  media.addEventListener("change", listener);
  return () => {
    events.forEach((event) => window.removeEventListener(event, listener));
    media.removeEventListener("change", listener);
  };
}

export function PwaSupport() {
  const browser = useSyncExternalStore(subscribeBrowser, browserSnapshot, () => 0);
  const ios = Boolean(browser & 1);
  const offline = Boolean(browser & 8);
  const [hidden, setHidden] = useState(false);
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [instructions, setInstructions] = useState(false);
  const [ready, setReady] = useState(false);
  const visible = !hidden && !(browser & 6) && (ios || installEvent !== null);

  useEffect(() => {
    let alive = true;
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallEvent);
    };
    const onInstalled = () => {
      setHidden(true);
      setInstallEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    const register = () => {
      if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then(() => navigator.serviceWorker.ready)
        .then(() => {
          if (alive) setReady(true);
        })
        .catch(() => {
          /* Online use remains available if caching is unsupported. */
        });
    };
    // Download the offline shell after the first page finishes loading.
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    return () => {
      alive = false;
      window.removeEventListener("load", register);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    setHidden(true);
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      /* optional */
    }
    window.dispatchEvent(new Event("pwa-dismissed"));
  }

  async function install() {
    if (ios) {
      setInstructions(true);
      return;
    }
    if (!installEvent) return;
    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      setInstallEvent(null);
      if (choice.outcome === "dismissed") dismiss();
      else setHidden(true);
    } catch {
      setInstallEvent(null);
    }
  }

  return (
    <>
      {offline && (
        <p role="status" className="bg-amber-50 px-4 py-3 text-center text-base text-amber-700">
          ออฟไลน์: กรอกและบันทึกคำขอ SOS ไว้ในเครื่องได้ ระบบจะลองส่งเมื่อกลับมาออนไลน์
          หากต้องการความช่วยเหลือด่วน โทร 1669 / 1784
        </p>
      )}
      {visible && (
        <aside
          aria-label="เพิ่มลงหน้าจอหลัก"
          className="border-border-default bg-bg-surface border-t px-4 py-4"
        >
          <div className="mx-auto flex max-w-2xl flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="font-heading text-text-primary text-lg font-semibold">
                เพิ่มน้ำใจไทยไว้บนหน้าจอหลัก
              </p>
              <p className="text-text-secondary text-base">
                {ios
                  ? "ช่วยให้เปิดใช้งานสะดวก และลดโอกาสที่ iPhone จะลบข้อมูลเว็บ"
                  : "เปิด SOS สายด่วน และคู่มือได้สะดวกเหมือนแอป"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={install}
                aria-expanded={ios ? instructions : undefined}
                className="bg-primary-600 min-h-12 rounded-full px-5 py-3 text-lg font-semibold text-white"
              >
                {ios ? "ดูวิธีเพิ่ม" : "เพิ่มหน้าจอหลัก"}
              </button>
              <button
                type="button"
                onClick={dismiss}
                aria-label="ปิดคำแนะนำเพิ่มหน้าจอหลัก"
                className="text-text-secondary min-h-12 rounded-full px-5 py-3 text-lg underline"
              >
                ไว้ก่อน
              </button>
            </div>
            {instructions && (
              <figure className="text-text-primary w-full text-lg">
                <svg
                  role="img"
                  aria-label="ภาพปุ่มแชร์ เมนูเพิ่มไปยังหน้าจอโฮม และปุ่มเพิ่มใน Safari"
                  viewBox="0 0 320 104"
                  className="bg-bg-subtle mb-2 w-full max-w-sm rounded-xl"
                >
                  <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <rect x="12" y="12" width="76" height="80" rx="9" />
                    <path d="M41 54h-5v20h28V54h-5M50 63V42m-7 7 7-7 7 7M94 52h13m-5-5 5 5-5 5" />
                    <rect x="114" y="12" width="92" height="80" rx="9" />
                    <rect x="122" y="42" width="76" height="24" rx="4" />
                    <path d="M130 54h10m-5-5v10M148 54h42M212 52h13m-5-5 5 5-5 5" />
                    <rect x="232" y="12" width="76" height="80" rx="9" />
                    <path d="M238 39h64" />
                  </g>
                  <g fill="currentColor" fontSize="13" textAnchor="middle">
                    <text x="50" y="30">
                      1
                    </text>
                    <text x="160" y="30">
                      2
                    </text>
                    <text x="247" y="30">
                      3
                    </text>
                    <text x="286" y="30">
                      เพิ่ม
                    </text>
                  </g>
                </svg>
                <figcaption>
                  บน iPhone: เปิดด้วย Safari แล้วกดปุ่มแชร์ → “เพิ่มไปยังหน้าจอโฮม” → “เพิ่ม”
                </figcaption>
              </figure>
            )}
          </div>
        </aside>
      )}
      {ready && !offline && (
        <p role="status" className="bg-bg-page text-text-secondary px-4 py-3 text-center text-base">
          พร้อมเปิดฟอร์ม SOS สายด่วน และคู่มือแบบออฟไลน์
        </p>
      )}
    </>
  );
}
