import { describe, expect, it } from "vitest";
import { formatCaseStatusLine } from "../../domain";
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
    expect(isReporterPath("/rescue/map")).toBe(false);
    expect(isReporterPath("/admin")).toBe(false);
    expect(isReporterPath("/units")).toBe(false);
  });

  it("แปลง path ไปมาได้ และหน้ากู้ภัย/แอดมินไม่มีภาษาอังกฤษ", () => {
    expect(localePath("/request", "en")).toBe("/en/request");
    expect(localePath("/en/request", "th")).toBe("/request");
    expect(localePath("/track/FL-2611-0001?t=abc", "en")).toBe("/en/track/FL-2611-0001?t=abc");
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
      } else if (th && en && typeof th === "object" && !Array.isArray(th)) {
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
