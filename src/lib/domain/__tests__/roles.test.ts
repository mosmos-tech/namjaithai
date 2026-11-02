import { describe, it, expect } from "vitest";
import {
  decideAccess,
  homePathForRole,
  parseSuperAdminLineIds,
  postLoginPath,
  requiredRolesForPath,
  safeNextPath,
  type UserRole,
} from "../roles";

const active = (role: UserRole) => ({ role, status: "ACTIVE" as const });

describe("homePathForRole — หลังล็อกอินไปหน้าตามบทบาท", () => {
  it("ผู้ใช้ → เคสของฉัน, กู้ภัย → แผนที่, หัวหน้า → หน่วยของฉัน, แอดมิน → ห้องสั่งการ", () => {
    expect(homePathForRole("USER")).toBe("/my-cases");
    expect(homePathForRole("RESCUER")).toBe("/rescue");
    expect(homePathForRole("UNIT_LEAD")).toBe("/unit");
    expect(homePathForRole("ADMIN")).toBe("/admin");
  });
});

describe("decideAccess — กัน /rescue /unit /admin", () => {
  it("หน้าสาธารณะเข้าได้ทุกคน", () => {
    for (const p of ["/", "/request", "/track/FL-2610-0001", "/login", "/hotlines"]) {
      expect(requiredRolesForPath(p)).toBeNull();
      expect(decideAccess(p, null)).toEqual({ allow: true });
    }
  });

  it("ไม่ล็อกอิน เข้าหน้าที่ต้องล็อกอินไม่ได้", () => {
    for (const p of ["/rescue", "/unit", "/admin", "/my-cases", "/admin/users"]) {
      expect(decideAccess(p, null)).toEqual({ allow: false, reason: "not-signed-in" });
    }
  });

  it.each([
    ["USER", ["/my-cases"], ["/rescue", "/unit", "/admin"]],
    ["RESCUER", ["/my-cases", "/rescue"], ["/unit", "/admin"]],
    ["UNIT_LEAD", ["/my-cases", "/rescue", "/unit"], ["/admin"]],
    ["ADMIN", ["/my-cases", "/rescue", "/unit", "/admin"], []],
  ] as const)("%s เข้าได้ %j ไม่ได้ %j", (role, allowed, denied) => {
    for (const p of allowed) expect(decideAccess(p, active(role)).allow).toBe(true);
    for (const p of denied) {
      expect(decideAccess(p, active(role))).toEqual({ allow: false, reason: "forbidden" });
    }
  });

  it("หน้าย่อยใช้สิทธิ์เดียวกับหน้าหลัก แต่ชื่อที่ขึ้นต้นเหมือนกันไม่นับ", () => {
    expect(decideAccess("/admin/audit", active("UNIT_LEAD")).allow).toBe(false);
    expect(requiredRolesForPath("/administrator")).toBeNull();
    expect(requiredRolesForPath("/rescue-info")).toBeNull();
  });

  it("บัญชีที่ไม่ ACTIVE เข้าไม่ได้แม้เป็นแอดมิน", () => {
    expect(decideAccess("/admin", { role: "ADMIN", status: "SUSPENDED" })).toEqual({
      allow: false,
      reason: "inactive",
    });
  });
});

describe("safeNextPath / postLoginPath — กันพาไปเว็บอื่นหลังล็อกอิน", () => {
  it("รับเฉพาะ path ในเว็บ", () => {
    expect(safeNextPath("/rescue")).toBe("/rescue");
    for (const bad of ["//evil.com", "https://evil.com", "/\\evil.com", "evil", "", null]) {
      expect(safeNextPath(bad)).toBeNull();
    }
  });

  it("กลับไปหน้าเดิมถ้ามีสิทธิ์ ไม่งั้นไปหน้าหลักของบทบาท", () => {
    expect(postLoginPath(active("RESCUER"), "/rescue/cases/1")).toBe("/rescue/cases/1");
    expect(postLoginPath(active("USER"), "/admin")).toBe("/my-cases");
    expect(postLoginPath(active("ADMIN"), "//evil.com")).toBe("/admin");
    expect(postLoginPath(active("ADMIN"), "/login")).toBe("/admin");
    expect(postLoginPath(active("UNIT_LEAD"), undefined)).toBe("/unit");
  });
});

describe("parseSuperAdminLineIds", () => {
  it("คั่นด้วยจุลภาคหรือเว้นวรรค ตัดช่องว่าง", () => {
    expect([...parseSuperAdminLineIds(" Uaaa, Ubbb  Uccc,,")]).toEqual(["Uaaa", "Ubbb", "Uccc"]);
    expect(parseSuperAdminLineIds(undefined).size).toBe(0);
  });
});
