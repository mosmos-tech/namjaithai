/**
 * แถบบอกสภาพแวดล้อมบนหัวเว็บ (TF-64) — อ่านจาก NEXT_PUBLIC_APP_ENV
 *   development  เครื่องตัวเอง     ไม่แสดง
 *   dev          branch develop   ฟ้า  "DEV · ข้อมูลทดสอบ"
 *   uat          branch uat       ส้ม  "UAT · ตรวจก่อนขึ้นจริง"
 *   production   branch main      ไม่แสดง
 * ค่าว่างหรือค่าที่ไม่รู้จัก = ไม่แสดง (หน้าตาเหมือนเว็บจริง)
 */
export type EnvBannerTone = "dev" | "uat";

export interface EnvBannerInfo {
  tone: EnvBannerTone;
  label: string;
}

const BANNERS: Record<EnvBannerTone, EnvBannerInfo> = {
  dev: { tone: "dev", label: "DEV · ข้อมูลทดสอบ" },
  uat: { tone: "uat", label: "UAT · ตรวจก่อนขึ้นจริง" },
};

export function envBannerFor(appEnv: string | undefined): EnvBannerInfo | null {
  const value = appEnv?.trim().toLowerCase();
  return value === "dev" || value === "uat" ? BANNERS[value] : null;
}
