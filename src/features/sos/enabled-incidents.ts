"use client";

import { useEffect, useState } from "react";
import { INCIDENT_TYPE_ORDER, IncidentType } from "../../lib/domain";
import { createClient } from "../../lib/supabase/client";

/**
 * ประเภทเหตุที่แอดมินเปิดรับแจ้งอยู่ (incident_types.is_enabled ของ TF-30) สำหรับกริดในขั้นที่ 1 (TF-66)
 * - โหลดจากฐานข้อมูลทุกครั้งที่เปิดฟอร์ม และจำรายการล่าสุดไว้ในเครื่องสำหรับตอนออฟไลน์
 * - ไม่เคยโหลดได้เลย (ออฟไลน์ตั้งแต่ครั้งแรก): แสดงแค่น้ำท่วม พร้อมแนะนำโทรสายด่วนสำหรับเหตุอื่น
 * เป็นแค่การซ่อนในหน้าจอ เซิร์ฟเวอร์ตรวจ is_enabled ซ้ำตอนสร้างเคสเสมอ
 */
export const ENABLED_INCIDENTS_STORAGE_KEY = "namjaithai-enabled-incidents";

export const FALLBACK_ENABLED_INCIDENTS: readonly IncidentType[] = [IncidentType.FLOOD];

export type EnabledIncidentsState = {
  types: readonly IncidentType[];
  /** "fallback" = ยังไม่เคยโหลดได้ ใช้รายการสำรอง (น้ำท่วมอย่างเดียว) */
  source: "loading" | "network" | "cache" | "fallback";
};

/** เรียงตามลำดับกริดและตัดรหัสที่โค้ดไม่รู้จักทิ้ง */
export function parseEnabledIncidents(value: unknown): IncidentType[] | null {
  if (!Array.isArray(value)) return null;
  const codes = new Set(value.filter((code): code is string => typeof code === "string"));
  return INCIDENT_TYPE_ORDER.filter((type) => codes.has(type));
}

export function readCachedEnabledIncidents(
  storage: Pick<Storage, "getItem"> | undefined,
): IncidentType[] | null {
  try {
    const raw = storage?.getItem(ENABLED_INCIDENTS_STORAGE_KEY);
    return raw ? parseEnabledIncidents(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function useEnabledIncidentTypes(): EnabledIncidentsState {
  const [state, setState] = useState<EnabledIncidentsState>({
    types: FALLBACK_ENABLED_INCIDENTS,
    source: "loading",
  });

  useEffect(() => {
    let active = true;
    const cached = readCachedEnabledIncidents(window.localStorage);
    void Promise.resolve().then(() => {
      if (active && cached) setState({ types: cached, source: "cache" });
    });

    void (async () => {
      try {
        // เครื่องรู้ตัวว่าไม่มีเน็ต: ไม่ต้องรอ (supabase-js ลองยิงซ้ำเองจนหมดเวลา)
        if (!navigator.onLine) throw new Error("offline");
        const { data, error } = await createClient()
          .from("incident_types")
          .select("code")
          .eq("is_enabled", true)
          // เน็ตช้ามากตอนน้ำท่วม: ไม่รอนานเกิน ใช้รายการในเครื่อง/สำรองแทน
          .abortSignal(AbortSignal.timeout(5000));
        if (error) throw error;
        const types = parseEnabledIncidents((data ?? []).map((row) => row.code)) ?? [];
        try {
          window.localStorage.setItem(ENABLED_INCIDENTS_STORAGE_KEY, JSON.stringify(types));
        } catch {
          // เก็บในเครื่องไม่ได้ ใช้รายการรอบนี้ไปก่อน
        }
        if (active) setState({ types, source: "network" });
      } catch {
        if (active && !cached) setState({ types: FALLBACK_ENABLED_INCIDENTS, source: "fallback" });
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  return state;
}
