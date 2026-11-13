"use client";

import { usePathname } from "next/navigation";
import {
  Suspense,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { isLocationSharingPath } from "@/lib/domain";
import {
  createLocationSharing,
  SHARING_OFF,
  type LocationSharing,
  type SharingStatus,
} from "../location-sharing";

type LocationSharingContext = {
  status: SharingStatus;
  start: () => void;
  stop: () => void;
};

const Context = createContext<LocationSharingContext | null>(null);

export const STOP_SHARING_URL = "/api/rescue/location/stop";

/**
 * TF-28 โหมดปฏิบัติงาน — อยู่ใน layout ของ /rescue จึงยังส่งต่อเมื่อสลับ /rescue/map ↔ /rescue/my-tasks
 * หยุดส่งและลบแถวในฐานข้อมูลทันทีเมื่อ:
 * - กดปิดสวิตช์
 * - ไปหน้าอื่นใน /rescue (เช่น /rescue/cases) — ตรวจจาก pathname
 * - ออกนอก /rescue (layout ถูกถอด) — cleanup ของ effect
 * - ปิดแท็บ/รีเฟรช/ออกจากระบบ (หน้าถูกปิด) — pagehide ส่ง beacon (ยิงได้แม้หน้ากำลังปิด)
 *   ออกจากระบบ: /auth/logout ลบแถวฝั่งเซิร์ฟเวอร์ซ้ำอีกชั้น · แบตหมด/เน็ตหลุด: pg_cron ลบเมื่อเกิน 1 ชม.
 */
export function LocationSharingProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<SharingStatus>(SHARING_OFF);
  const sharingRef = useRef<LocationSharing | null>(null);

  const getSharing = useCallback(() => {
    if (!sharingRef.current) {
      const supabase = createClient();
      sharingRef.current = createLocationSharing({
        geolocation: navigator.geolocation,
        wakeLock: "wakeLock" in navigator ? navigator.wakeLock : undefined,
        send: async ({ lat, lng, accuracyM }) => {
          const { data, error } = await supabase.rpc("share_my_location", {
            p_lat: lat,
            p_lng: lng,
            p_accuracy_m: accuracyM,
          });
          if (error?.code === "42501") return "NOT_ALLOWED";
          if (error) throw error;
          return (data as { status: "SAVED" | "TOO_SOON" }).status;
        },
        stopRemote: async () => {
          const { error } = await supabase.rpc("stop_sharing_location");
          if (error) throw error;
        },
        onStatus: setStatus,
      });
    }
    return sharingRef.current;
  }, []);

  const start = useCallback(() => getSharing().start(), [getSharing]);
  const stop = useCallback(() => void sharingRef.current?.stop(), []);

  useEffect(() => {
    const onPageHide = () => {
      if (!sharingRef.current?.isActive()) return;
      navigator.sendBeacon(STOP_SHARING_URL);
      void sharingRef.current.stop();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") sharingRef.current?.handleVisible();
    };
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
      // ออกนอก /rescue (เปลี่ยนหน้าในเว็บ) → หยุดและลบแถว
      void sharingRef.current?.stop();
    };
  }, []);

  const value = useMemo(() => ({ status, start, stop }), [status, start, stop]);
  return (
    <Context.Provider value={value}>
      {children}
      {/* usePathname ต้องอยู่ใน Suspense (Cache Components) */}
      <Suspense fallback={null}>
        <StopOutsideSharingPaths stop={stop} />
      </Suspense>
    </Context.Provider>
  );
}

/** ไปหน้าอื่นใน /rescue ที่เปิดโหมดไม่ได้ (เช่น /rescue/cases) → หยุด */
function StopOutsideSharingPaths({ stop }: { stop: () => void }) {
  const pathname = usePathname();
  useEffect(() => {
    if (!isLocationSharingPath(pathname)) stop();
  }, [pathname, stop]);
  return null;
}

export function useLocationSharing(): LocationSharingContext | null {
  return useContext(Context);
}
