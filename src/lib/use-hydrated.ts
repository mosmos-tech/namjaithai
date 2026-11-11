"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * true เมื่อ React hydrate หน้านี้เสร็จแล้ว (ปุ่ม/ช่องกรอกมีตัวจัดการ event แล้ว) — TF-68
 * ก่อนหน้านั้น HTML จากเซิร์ฟเวอร์แสดงอยู่แต่กดแล้วไม่มีอะไรเกิดขึ้น (การกดหายเงียบ)
 * ใช้ปิดปุ่มที่ต้องใช้ JS ไว้ก่อน ห้ามใช้ปิดลิงก์โทร tel: / sms: ที่ทำงานได้โดยไม่ต้องใช้ JS
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
