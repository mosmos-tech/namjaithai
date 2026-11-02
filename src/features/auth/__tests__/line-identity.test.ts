import { describe, it, expect } from "vitest";
import type { User } from "@supabase/supabase-js";
import { LINE_PROVIDER, lineProfileFromAuthUser, roleOnLogin } from "../line-identity";

type Fake = Pick<User, "identities" | "user_metadata">;

describe("lineProfileFromAuthUser", () => {
  it("อ่าน LINE user ID / ชื่อ / รูป จาก identity ของ LINE", () => {
    const user = {
      user_metadata: {},
      identities: [
        {
          provider: LINE_PROVIDER,
          id: "Uabc",
          identity_data: { sub: "Uabc", name: "สมชาย", picture: "https://profile.line-scdn.net/x" },
        },
      ],
    } as unknown as Fake;
    expect(lineProfileFromAuthUser(user)).toEqual({
      lineUserId: "Uabc",
      displayName: "สมชาย",
      avatarUrl: "https://profile.line-scdn.net/x",
    });
  });

  it("ไม่มีชื่อ ใช้ชื่อสำรอง (display_name ในตารางห้ามว่าง)", () => {
    const user = { user_metadata: { sub: "Uabc" }, identities: [] } as unknown as Fake;
    expect(lineProfileFromAuthUser(user)).toMatchObject({
      lineUserId: "Uabc",
      displayName: "ผู้ใช้ LINE",
      avatarUrl: null,
    });
  });

  it("ไม่มี LINE user ID เลย คืน null", () => {
    expect(
      lineProfileFromAuthUser({ user_metadata: {}, identities: [] } as unknown as Fake),
    ).toBeNull();
  });
});

describe("roleOnLogin", () => {
  const admins = new Set(["Uadmin"]);
  it("ล็อกอินครั้งแรกเป็นผู้ใช้ทั่วไป", () => {
    expect(roleOnLogin(null, "Unew", admins)).toBe("USER");
  });
  it("อยู่ใน SUPER_ADMIN_LINE_IDS เป็นแอดมินอัตโนมัติ ทั้งครั้งแรกและคนเดิม", () => {
    expect(roleOnLogin(null, "Uadmin", admins)).toBe("ADMIN");
    expect(roleOnLogin("USER", "Uadmin", admins)).toBe("ADMIN");
  });
  it("คนเดิมคงบทบาทเดิม ไม่ลดสิทธิ์อัตโนมัติ", () => {
    expect(roleOnLogin("RESCUER", "Ux", admins)).toBe("RESCUER");
    expect(roleOnLogin("ADMIN", "Ux", admins)).toBe("ADMIN");
  });
});
