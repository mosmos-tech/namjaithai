"use client";

import { useEffect, useState } from "react";
import { isClosedStatus, type TrackedCase } from "@/lib/domain";

// กติกาโปรเจกต์: ผู้แจ้งใช้ polling ทุก 15–30 วินาที ไม่ใช้ Realtime (ประหยัดโควตา Supabase)
export const TRACK_POLL_MS = 20_000;

type State =
  | { kind: "loading" }
  | { kind: "ready"; data: TrackedCase; fetchedAt: Date; stale: boolean }
  | { kind: "error"; message: string; status: number };

/**
 * ดึงข้อมูลติดตามเคสทุก 20 วินาที
 * - หยุดดึงเมื่อเคสปิดแล้ว (สำเร็จ/ยกเลิก/ซ้ำ/ติดต่อไม่ได้)
 * - หยุดดึงตอนแท็บถูกซ่อน ประหยัดแบตและเน็ต แล้วดึงทันทีเมื่อกลับมาเปิดแท็บ
 * - เน็ตหลุดชั่วคราว: เก็บข้อมูลเดิมไว้และบอกว่า stale แล้วลองใหม่รอบถัดไป
 */
export function useTrackedCase(caseCode: string, token: string): State {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;

    async function load() {
      clearTimeout(timer);
      try {
        const res = await fetch(
          `/api/track/${encodeURIComponent(caseCode)}?t=${encodeURIComponent(token)}`,
          { cache: "no-store" },
        );
        const body = (await res.json()) as TrackedCase | { error: string };
        if (cancelled) return;
        if (!res.ok || "error" in body) {
          const message = "error" in body ? body.error : "ดึงข้อมูลเคสไม่สำเร็จ";
          // 404/400 = ลิงก์ผิด ไม่ต้องลองซ้ำ; อย่างอื่นอาจหายเองได้
          setState((prev) =>
            prev.kind === "ready" && res.status >= 500
              ? { ...prev, stale: true }
              : { kind: "error", message, status: res.status },
          );
          if (res.status < 500) return;
        } else {
          closed = isClosedStatus(body.status);
          setState({ kind: "ready", data: body, fetchedAt: new Date(), stale: false });
          if (closed) return;
        }
      } catch {
        if (cancelled) return;
        setState((prev) =>
          prev.kind === "ready"
            ? { ...prev, stale: true }
            : {
                kind: "error",
                message: "เชื่อมต่ออินเทอร์เน็ตไม่ได้ จะลองใหม่อัตโนมัติ",
                status: 0,
              },
        );
      }
      if (!document.hidden) timer = setTimeout(load, TRACK_POLL_MS);
    }

    function onVisibility() {
      if (document.hidden) clearTimeout(timer);
      else if (!closed) load();
    }

    load();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [caseCode, token]);

  return state;
}
