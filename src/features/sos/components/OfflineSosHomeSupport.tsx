"use client";

import { useEffect, useState, type ComponentType } from "react";

// The lightweight Pages Router home must also show pending SOS while offline.
// Load the full queue interface only when a queue exists and a network is available.
export function OfflineSosHomeSupport() {
  const [status, setStatus] = useState<"pending" | "sent" | null>(null);
  const [Support, setSupport] = useState<ComponentType | null>(null);

  useEffect(() => {
    let active = true;
    let loading = false;
    function check() {
      const request = indexedDB.open("namjaithai-offline-sos", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("queue");
      request.onerror = () => undefined;
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction("queue");
        const read = transaction.objectStore("queue").get("current");
        read.onsuccess = () => {
          if (!active) return;
          const item = read.result as { status?: string } | undefined;
          setStatus(!item ? null : item.status === "sent" ? "sent" : "pending");
          if (item && navigator.onLine && !loading) {
            loading = true;
            void import("./OfflineSosSupport")
              .then(({ OfflineSosSupport }) => {
                if (active) setSupport(() => OfflineSosSupport);
              })
              .catch(() => {
                loading = false;
              });
          }
        };
        transaction.oncomplete = () => db.close();
      };
    }
    const message = (event: MessageEvent) => {
      if (event.data?.type === "sos-queue-changed") check();
    };
    void Promise.resolve().then(check);
    window.addEventListener("online", check);
    navigator.serviceWorker?.addEventListener("message", message);
    const timer = window.setInterval(check, 10000);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("online", check);
      navigator.serviceWorker?.removeEventListener("message", message);
    };
  }, []);

  if (Support) return <Support />;
  if (!status) return null;
  return (
    <a
      href="/request"
      className="block w-full bg-orange-600 px-4 py-3 text-center text-lg font-bold text-white"
    >
      {status === "sent" ? "ส่งถึงระบบแล้ว — กดดูรหัสเคส" : "มี 1 คำขอรอส่ง — กดดูรายละเอียด"}
    </a>
  );
}
