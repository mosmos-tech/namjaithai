// TF-68: เทียบ/อัปเดตคีย์ Supabase ใน .env.local ให้ตรงกับ Supabase ในเครื่อง (npx supabase status -o env)
// คีย์เก่าค้างใน .env.local: REST/Auth ในเครื่องยังรับ แต่ Realtime ปฏิเสธ (MalformedJWT) — ดู docs/environments.md
// ฟังก์ชันในไฟล์นี้ไม่พิมพ์ค่าคีย์ออกมาเลย คืนแค่ชื่อตัวแปรที่เปลี่ยน

/** ตัวแปรใน .env.local ← ชื่อใน `supabase status -o env` */
export const SUPABASE_ENV_MAP = {
  NEXT_PUBLIC_SUPABASE_URL: "API_URL",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "PUBLISHABLE_KEY",
  SUPABASE_SECRET_KEY: "SECRET_KEY",
} as const;

export type LocalEnvName = keyof typeof SUPABASE_ENV_MAP;

/** แปลงผล `supabase status -o env` (บรรทัด KEY="value") เป็น object */
export function parseStatusEnv(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    result[match[1]] = match[2].trim().replace(/^"(.*)"$/, "$1");
  }
  return result;
}

const valueOf = (envText: string, name: string): string | undefined => {
  const line = envText.split("\n").find((item) => item.startsWith(`${name}=`));
  return line
    ?.slice(name.length + 1)
    .trim()
    .replace(/^"(.*)"$/, "$1");
};

/**
 * ค่าใหม่ของ .env.local และชื่อตัวแปรที่เปลี่ยน — แก้เฉพาะ 3 ตัวใน SUPABASE_ENV_MAP
 * บรรทัดอื่น (คอมเมนต์ คีย์ LINE ฯลฯ) คงเดิม ตัวที่ยังไม่มีเติมท้ายไฟล์
 */
export function syncEnvText(
  envText: string,
  status: Record<string, string>,
): { text: string; changed: LocalEnvName[]; missing: string[] } {
  let text = envText;
  const changed: LocalEnvName[] = [];
  const missing: string[] = [];
  for (const [name, statusName] of Object.entries(SUPABASE_ENV_MAP) as [LocalEnvName, string][]) {
    const next = status[statusName];
    if (!next) {
      missing.push(statusName);
      continue;
    }
    if (valueOf(text, name) === next) continue;
    changed.push(name);
    const lines = text.split("\n");
    const index = lines.findIndex((line) => line.startsWith(`${name}=`));
    if (index >= 0) lines[index] = `${name}=${next}`;
    else {
      if (lines.at(-1) === "") lines.pop();
      lines.push(`${name}=${next}`, "");
    }
    text = lines.join("\n");
  }
  return { text, changed, missing };
}
