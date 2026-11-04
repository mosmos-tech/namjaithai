import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { EnvBanner } from "../../components/EnvBanner";
import { envBannerFor } from "../env-banner";

describe("envBannerFor — แถบบอกสภาพแวดล้อม (TF-64)", () => {
  it("dev: แถบฟ้า DEV · ข้อมูลทดสอบ", () => {
    expect(envBannerFor("dev")).toEqual({ tone: "dev", label: "DEV · ข้อมูลทดสอบ" });
  });

  it("uat: แถบส้ม UAT · ตรวจก่อนขึ้นจริง", () => {
    expect(envBannerFor("uat")).toEqual({ tone: "uat", label: "UAT · ตรวจก่อนขึ้นจริง" });
  });

  it("production และในเครื่อง (development) ไม่แสดง", () => {
    expect(envBannerFor("production")).toBeNull();
    expect(envBannerFor("development")).toBeNull();
  });

  it("ไม่ได้ตั้งค่า หรือค่าที่ไม่รู้จัก ไม่แสดง", () => {
    for (const value of [undefined, "", "   ", "staging", "prod"]) {
      expect(envBannerFor(value), String(value)).toBeNull();
    }
  });

  it("ไม่สนตัวพิมพ์เล็ก/ใหญ่และช่องว่างหัวท้าย (พิมพ์ใน Vercel พลาดได้)", () => {
    expect(envBannerFor(" DEV ")?.tone).toBe("dev");
    expect(envBannerFor("Uat")?.tone).toBe("uat");
  });
});

describe("<EnvBanner /> — ไม่บังแถบโทรสายด่วน", () => {
  it("dev/uat แสดงข้อความ และเป็นแถบธรรมดา ไม่ลอยทับ (ไม่มี fixed/sticky/absolute)", () => {
    for (const appEnv of ["dev", "uat"]) {
      const html = renderToStaticMarkup(createElement(EnvBanner, { appEnv }));
      expect(html).toContain(appEnv.toUpperCase());
      expect(html).not.toMatch(/\b(fixed|sticky|absolute)\b/);
      expect(html).not.toMatch(/\bz-\d+/);
    }
  });

  it("production ไม่แสดงอะไรเลย", () => {
    expect(renderToStaticMarkup(createElement(EnvBanner, { appEnv: "production" }))).toBe("");
  });
});
