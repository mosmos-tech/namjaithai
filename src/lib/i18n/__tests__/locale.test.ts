import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { THAI_PWA_TEXT } from "../../../features/pwa/PwaSupport";
import {
  formatCaseStatusLine,
  UNIT_CAPABILITY_LABELS,
  UNIT_CAPABILITY_LABELS_EN,
  unitCapabilityLabels,
} from "../../domain";
import { REPORTER_TEXT_EN } from "../reporter-text.en";
import { REPORTER_TEXT_TH } from "../reporter-text";
import {
  format,
  isReporterPath,
  localeFromAcceptLanguage,
  localePath,
  stripLocale,
} from "../locale";

describe("TF-63 เลือกภาษาครั้งแรกตามเบราว์เซอร์", () => {
  it("th → ไทย ภาษาอื่น → English อ่านไม่ได้ → ไทย", () => {
    expect(localeFromAcceptLanguage("th-TH,th;q=0.9,en;q=0.8")).toBe("th");
    expect(localeFromAcceptLanguage("th")).toBe("th");
    expect(localeFromAcceptLanguage("en-US,en;q=0.9")).toBe("en");
    expect(localeFromAcceptLanguage("zh-CN,zh;q=0.9")).toBe("en");
    expect(localeFromAcceptLanguage("en;q=0.5,th;q=0.9")).toBe("th");
    expect(localeFromAcceptLanguage("")).toBe("th");
    expect(localeFromAcceptLanguage(null)).toBe("th");
    expect(localeFromAcceptLanguage("*")).toBe("th");
    expect(localeFromAcceptLanguage(";;;q=abc")).toBe("th");
  });
});

describe("TF-63 path ภาษา", () => {
  it("เฉพาะหน้าฝั่งผู้แจ้งมี /en", () => {
    expect(isReporterPath("/request")).toBe(true);
    expect(isReporterPath("/track/FL-2611-0001")).toBe(true);
    expect(isReporterPath("/units")).toBe(true);
    expect(isReporterPath("/units/u1")).toBe(true);
    expect(isReporterPath("/survival")).toBe(true);
    expect(isReporterPath("/rescue/map")).toBe(false);
    expect(isReporterPath("/admin")).toBe(false);
  });

  it("แปลง path ไปมาได้ และหน้ากู้ภัย/แอดมินไม่มีภาษาอังกฤษ", () => {
    expect(localePath("/request", "en")).toBe("/en/request");
    expect(localePath("/en/request", "th")).toBe("/request");
    expect(localePath("/track/FL-2611-0001?t=abc", "en")).toBe("/en/track/FL-2611-0001?t=abc");
    expect(localePath("/units", "en")).toBe("/en/units");
    expect(localePath("/units/u1?q=test", "en")).toBe("/en/units/u1?q=test");
    expect(localePath("/survival", "en")).toBe("/en/survival");
    expect(localePath("/en/units", "th")).toBe("/units");
    expect(localePath("/en/survival", "th")).toBe("/survival");
    expect(localePath("/rescue/map", "en")).toBe("/rescue/map");
    expect(stripLocale("/en/hotlines")).toEqual({ locale: "en", path: "/hotlines" });
    expect(stripLocale("/hotlines")).toEqual({ locale: "th", path: "/hotlines" });
  });

  it("แทนค่าในข้อความ", () => {
    expect(format("Step {step} of {total}", { step: 2, total: 5 })).toBe("Step 2 of 5");
    expect(format("{missing}", {})).toBe("{missing}");
  });
});

describe("TF-63 dictionary", () => {
  it("ภาษาอังกฤษไม่มีข้อความว่าง และไม่หลงภาษาไทย (ยกเว้นชื่อปุ่มภาษาไทย)", () => {
    const walk = (value: unknown, path: string): void => {
      if (typeof value === "string") {
        expect(value.trim(), path).not.toBe("");
        if (!path.endsWith("switchToThai")) {
          expect(value, path).not.toMatch(/[฀-๿]/);
        }
      } else if (Array.isArray(value)) {
        value.forEach((item, i) => walk(item, `${path}[${i}]`));
      } else if (value && typeof value === "object") {
        for (const [key, item] of Object.entries(value)) {
          // badge ว่าง = กลุ่มที่ไม่มีป้าย (ตรงกับภาษาไทย)
          if (key === "badge" && item === "") continue;
          walk(item, `${path}.${key}`);
        }
      }
    };
    walk(REPORTER_TEXT_EN, "en");
  });

  it("ข้อความที่มีตัวแปรใช้ตัวแปรชุดเดียวกันทั้งสองภาษา", () => {
    const vars = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const compare = (th: unknown, en: unknown, path: string): void => {
      if (typeof th === "string" && typeof en === "string") {
        // ปีใน footer: ไทยใช้ พ.ศ. ({yearBE}) อังกฤษใช้ ค.ศ. ({yearCE}) โดยตั้งใจ
        if (path.endsWith("footerCopyright")) return;
        expect(vars(en), path).toEqual(vars(th));
      } else if (Array.isArray(th)) {
        expect(Array.isArray(en), path).toBe(true);
        if (!Array.isArray(en)) return;
        // หน้าสายด่วนภาษาอังกฤษมีตำรวจท่องเที่ยว 1155 เพิ่มอีก 1 เบอร์ (TF-63)
        if (path === "text.hotlines.items") {
          expect(en.length, path).toBe(th.length + 1);
          en.forEach((item, i) => compare(th[0], item, `${path}[${i}]`));
          return;
        }
        expect(en.length, path).toBe(th.length);
        th.forEach((item, i) => compare(item, en[i], `${path}[${i}]`));
      } else if (th && en && typeof th === "object") {
        for (const key of Object.keys(th)) {
          compare(
            (th as Record<string, unknown>)[key],
            (en as Record<string, unknown>)[key],
            `${path}.${key}`,
          );
        }
      }
    };
    compare(REPORTER_TEXT_TH, REPORTER_TEXT_EN, "text");
  });

  it("เมนูหลักและ footer ภาษาอังกฤษมีหน่วยกู้ภัยและคู่มือเอาตัวรอดครบ 5 รายการ", () => {
    expect(REPORTER_TEXT_EN.chrome.nav).toEqual([
      { label: "Request help", href: "/en/request" },
      { label: "Track a case", href: "/en/track" },
      { label: "Hotlines", href: "/en/hotlines" },
      { label: "Rescue units", href: "/en/units" },
      { label: "Survival guide", href: "/en/survival" },
    ]);
    expect(REPORTER_TEXT_EN.chrome.footerUnits).toBe("Rescue units");
  });

  it("UNIT_CAPABILITY_LABELS_EN แปลครบทุกความสามารถและไม่มีภาษาไทยหลง", () => {
    for (const key of Object.keys(UNIT_CAPABILITY_LABELS) as (keyof typeof UNIT_CAPABILITY_LABELS)[]) {
      const en = UNIT_CAPABILITY_LABELS_EN[key];
      expect(en?.trim(), key).toBeTruthy();
      expect(en, key).not.toMatch(/[฀-๿]/);
    }
    expect(unitCapabilityLabels("en")).toBe(UNIT_CAPABILITY_LABELS_EN);
    expect(unitCapabilityLabels("th")).toBe(UNIT_CAPABILITY_LABELS);
    expect(unitCapabilityLabels()).toBe(UNIT_CAPABILITY_LABELS);
  });

  it("คู่มือเอาตัวรอดและเช็กลิสต์ 72 ชม. มีครบทั้งสองภาษาและอยู่ใน docs/incident-content-en.md", () => {
    const thSurvival = REPORTER_TEXT_TH.survival;
    const enSurvival = REPORTER_TEXT_EN.survival;
    expect(enSurvival.phases.map((p) => p.key)).toEqual(["before", "during", "after"]);
    expect(enSurvival.phases.map((p) => p.tips.length)).toEqual([5, 5, 5]);
    expect(enSurvival.checklist.items.map((item) => item.id)).toEqual(
      thSurvival.checklist.items.map((item) => item.id),
    );
    expect(enSurvival.checklist.items).toHaveLength(12);

    const doc = readFileSync(join(process.cwd(), "docs", "incident-content-en.md"), "utf8");
    for (let i = 0; i < thSurvival.phases.length; i++) {
      expect(doc).toContain(thSurvival.phases[i].phase);
      expect(doc).toContain(enSurvival.phases[i].phase);
      for (let j = 0; j < thSurvival.phases[i].tips.length; j++) {
        expect(doc).toContain(thSurvival.phases[i].tips[j]);
        expect(doc).toContain(enSurvival.phases[i].tips[j]);
      }
    }
    expect(doc).toContain(thSurvival.checklist.title);
    expect(doc).toContain(enSurvival.checklist.title);
    expect(doc).toContain(thSurvival.checklist.progress);
    expect(doc).toContain(enSurvival.checklist.progress);
    expect(doc).toContain(thSurvival.checklist.readyBanner);
    expect(doc).toContain(enSurvival.checklist.readyBanner);
    for (let i = 0; i < thSurvival.checklist.items.length; i++) {
      expect(doc).toContain(thSurvival.checklist.items[i].label);
      expect(doc).toContain(enSurvival.checklist.items[i].label);
    }
  });

  it("THAI_PWA_TEXT ตรงกับ REPORTER_TEXT_TH.pwa และ PwaSupport.tsx ไม่ import dictionary/next-navigation (TF-41)", () => {
    expect(THAI_PWA_TEXT).toEqual(REPORTER_TEXT_TH.pwa);
    const pwaSource = readFileSync(
      join(process.cwd(), "src", "features", "pwa", "PwaSupport.tsx"),
      "utf8",
    );
    expect(pwaSource).not.toMatch(/reporter-text/);
    expect(pwaSource).not.toMatch(/next\/navigation/);
  });

  it("service worker เก็บหน้า /survival และ /en/survival ไว้เปิดออฟไลน์", () => {
    const sw = readFileSync(join(process.cwd(), "scripts", "pwa", "service-worker.js"), "utf8");
    const match = sw.match(/const PAGES = \[([\s\S]*?)\];/);
    expect(match).not.toBeNull();
    const pages = JSON.parse(`[${match![1].replace(/,\s*$/, "")}]`) as string[];
    expect(pages).toContain("/survival");
    expect(pages).toContain("/en/survival");
  });
});

describe("TF-63 ลิงก์ติดตามใน LINE พาไปภาษาที่ผู้แจ้งใช้", () => {
  const ref = {
    caseCode: "FL-2611-0001",
    trackingToken: "a".repeat(32),
    incidentType: "FLOOD",
    district: null,
    province: null,
    origin: "https://example.test",
    toStatus: "ACCEPTED" as const,
    at: "2026-11-12T03:00:00Z",
  };
  it("ผู้แจ้งภาษาอังกฤษได้ลิงก์ /en/track", () => {
    expect(formatCaseStatusLine({ ...ref, locale: "en" })).toContain(
      "https://example.test/en/track/FL-2611-0001?t=",
    );
  });
  it("ผู้แจ้งภาษาไทย (หรือแถวเก่าที่ไม่มีภาษา) ได้ลิงก์เดิม", () => {
    expect(formatCaseStatusLine(ref)).toContain("https://example.test/track/FL-2611-0001?t=");
    expect(formatCaseStatusLine({ ...ref, locale: "th" })).not.toContain("/en/");
  });
});
