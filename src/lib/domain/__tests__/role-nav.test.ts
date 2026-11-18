import { describe, expect, it } from "vitest";
import { navigationForRole, requiredRolesForPath, type UserRole } from "../roles";

describe("TF-75 เมนูตามบทบาท", () => {
  it.each([
    ["ADMIN", ["/admin", "/admin/cases", "/admin/audit", "/rescue/map", "/units"]],
    ["UNIT_LEAD", ["/rescue/map", "/rescue/cases", "/rescue/my-tasks", "/unit", "/unit/dashboard"]],
    ["RESCUER", ["/rescue/map", "/rescue/cases", "/rescue/my-tasks", "/unit/dashboard"]],
  ] as const)("แสดงเมนู %s ตามสิทธิ์", (role, paths) => {
    const links = navigationForRole(role);
    expect(links.map((link) => link.href)).toEqual(paths);
    for (const link of links)
      expect(requiredRolesForPath(link.href)?.includes(role) ?? true).toBe(true);
  });
  it("ผู้ใช้ทั่วไปไม่มีเมนูเจ้าหน้าที่", () => {
    expect(navigationForRole("USER")).toEqual([]);
  });
  it("ไม่แสดงลิงก์ที่ไม่มีสิทธิ์", () => {
    for (const role of ["USER", "RESCUER", "UNIT_LEAD", "ADMIN"] as UserRole[]) {
      for (const link of navigationForRole(role)) {
        expect(requiredRolesForPath(link.href)?.includes(role) ?? true).toBe(true);
      }
    }
  });
});
