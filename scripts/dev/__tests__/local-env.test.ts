import { describe, expect, it } from "vitest";
import { parseStatusEnv, syncEnvText } from "../local-env";

const STATUS = parseStatusEnv(
  [
    'API_URL="http://127.0.0.1:54321"',
    'PUBLISHABLE_KEY="sb_publishable_NEW"',
    'SECRET_KEY="sb_secret_SAME"',
    'JWT_SECRET="ignored"',
  ].join("\n"),
);

describe("env:sync (TF-68)", () => {
  it("อ่านผล supabase status -o env", () => {
    expect(STATUS).toMatchObject({
      API_URL: "http://127.0.0.1:54321",
      PUBLISHABLE_KEY: "sb_publishable_NEW",
    });
  });

  it("แก้เฉพาะตัวที่ไม่ตรง บรรทัดอื่นคงเดิม และบอกแค่ชื่อตัวแปร", () => {
    const env = [
      "# คอมเมนต์",
      "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_OLD",
      "SUPABASE_SECRET_KEY=sb_secret_SAME",
      "LINE_CHANNEL_SECRET=keep-me",
      "",
    ].join("\n");
    const result = syncEnvText(env, STATUS);
    expect(result.changed).toEqual(["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]);
    expect(result.text).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_NEW");
    expect(result.text).toContain("LINE_CHANNEL_SECRET=keep-me");
    expect(result.text).toContain("# คอมเมนต์");
    expect(result.text).not.toContain("OLD");
  });

  it("ตรงกันแล้วไม่เปลี่ยน · ไม่มีตัวแปรก็เติมท้ายไฟล์", () => {
    const synced = syncEnvText("", STATUS);
    expect(synced.changed).toHaveLength(3);
    expect(syncEnvText(synced.text, STATUS).changed).toEqual([]);
  });

  it("status ไม่มีค่าที่ต้องใช้ แจ้งชื่อที่ขาด", () => {
    expect(syncEnvText("", { API_URL: "x" }).missing).toEqual(["PUBLISHABLE_KEY", "SECRET_KEY"]);
  });
});
