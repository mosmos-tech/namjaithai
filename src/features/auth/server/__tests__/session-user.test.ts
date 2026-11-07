import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { getSessionUserRow } from "../session-user";

function client(memberships: unknown[]) {
  const user = {
    id: "user-1",
    display_name: "ผู้ใช้",
    avatar_url: null,
    role: "RESCUER",
    status: "ACTIVE",
  };
  const userQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: user }),
  };
  const memberQuery = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
  memberQuery.eq.mockReturnValueOnce(memberQuery).mockResolvedValueOnce({ data: memberships });
  return {
    auth: { getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: "auth-1" } } }) },
    from: vi.fn((table: string) => (table === "users" ? userQuery : memberQuery)),
  } as unknown as SupabaseClient;
}

describe("session rescue permissions", () => {
  it("keeps rescuer access only with an active unit membership", async () => {
    const active = {
      status: "APPROVED",
      expires_at: "2099-01-01T00:00:00Z",
      unit: { is_active: true },
    };
    expect((await getSessionUserRow(client([active])))?.role).toBe("RESCUER");
    expect((await getSessionUserRow(client([{ ...active, unit: [{ is_active: true }] }])))?.role).toBe("RESCUER");
    expect(
      (await getSessionUserRow(client([{ ...active, unit: { is_active: false } }])))?.role,
    ).toBe("USER");
    expect(
      (await getSessionUserRow(client([{ ...active, unit: [{ is_active: false }] }])))?.role,
    ).toBe("USER");
    expect((await getSessionUserRow(client([])))?.role).toBe("USER");
  });
});
