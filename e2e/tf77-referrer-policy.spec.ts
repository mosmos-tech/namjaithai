import { expect, test } from "@playwright/test";

/**
 * TF-77: ทุกหน้าส่ง URL ให้เว็บอื่นได้แค่โดเมน (Referrer-Policy) — กัน token ใน URL รั่ว
 * และต้องไม่ใช่ no-referrer เพราะ tile.openstreetmap.org บังคับให้มี Referer (ไม่งั้นตอบ 403 Access blocked)
 * หน้าติดตามเคส (มี token) ตรวจละเอียดใน reporter-team-tracking.spec.ts
 */
for (const path of ["/", "/request", "/en/request", "/track", "/hotlines", "/login"]) {
  test(`${path} ส่ง Referer ให้เว็บอื่นได้แค่โดเมน`, async ({ request }) => {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });
}
