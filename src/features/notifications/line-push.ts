// ── ส่งข้อความ LINE ทีละข้อความ + ตัดสินผล (TF-34) ──────────────────────────

export type PushResult = "SENT" | "RETRY" | "FAILED" | "QUOTA_EXHAUSTED";

/**
 * แปลผลจาก LINE Messaging API
 * - 2xx หรือ 409 ที่มี accepted-request-id (retry key เดิมถูกรับไปแล้ว) = ส่งแล้ว
 * - 429 ที่บอกว่าโควตาเดือนนี้หมด = หยุดทั้งระบบ ห้าม retry
 * - 429 อื่น (ยิงถี่เกิน) / 5xx = ลองใหม่ภายหลัง
 * - อื่นๆ (400/401/403/409 ไม่มี id) = ล้มถาวร
 */
export function classifyLineResponse(
  status: number,
  body: string,
  hasAcceptedRequestId = false,
): PushResult {
  if ((status >= 200 && status < 300) || (status === 409 && hasAcceptedRequestId)) return "SENT";
  if (status === 429) return isMonthlyLimitMessage(body) ? "QUOTA_EXHAUSTED" : "RETRY";
  if (status >= 500) return "RETRY";
  return "FAILED";
}

// LINE ตอบ {"message":"You have reached your monthly limit."} เมื่อโควตาข้อความรายเดือนหมด
function isMonthlyLimitMessage(body: string): boolean {
  try {
    const message = (JSON.parse(body) as { message?: unknown }).message;
    return typeof message === "string" && /monthly limit/i.test(message);
  } catch {
    return /monthly limit/i.test(body);
  }
}

export type DeliveryMode = "SEND" | "SKIP";

/**
 * ส่งจริงหรือแค่เขียน log ตามสภาพแวดล้อม (ไม่ให้ dev/uat ส่งถึงผู้ใช้จริงและไม่เปลืองโควตา)
 * - production: ส่งทุกคน
 * - dev / uat: ส่งเฉพาะ LINE ID ใน SUPER_ADMIN_LINE_IDS
 * - อื่นๆ (เครื่องตัวเอง, ไม่ได้ตั้งค่า): ไม่ส่งเลย
 */
export function lineDeliveryMode(
  appEnv: string | undefined,
  lineUserId: string,
  superAdminLineIds: ReadonlySet<string>,
): DeliveryMode {
  const env = appEnv?.trim().toLowerCase();
  if (env === "production") return "SEND";
  if ((env === "dev" || env === "uat") && superAdminLineIds.has(lineUserId)) return "SEND";
  return "SKIP";
}

export async function pushLineText(input: {
  fetcher?: typeof fetch;
  token: string;
  to: string;
  text: string;
  retryKey: string;
}): Promise<{ result: PushResult; error: string | null }> {
  try {
    const response = await (input.fetcher ?? fetch)("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.token}`,
        "Content-Type": "application/json",
        "X-Line-Retry-Key": input.retryKey,
      },
      body: JSON.stringify({ to: input.to, messages: [{ type: "text", text: input.text }] }),
      signal: AbortSignal.timeout(5000),
    });
    const body = response.ok ? "" : await response.text().catch(() => "");
    const result = classifyLineResponse(
      response.status,
      body,
      response.headers.has("x-line-accepted-request-id"),
    );
    // เก็บแค่รหัส ไม่เก็บเนื้อหาตอบกลับ (อาจมีข้อมูลส่วนตัว)
    const error =
      result === "SENT"
        ? null
        : result === "QUOTA_EXHAUSTED"
          ? "line_monthly_quota"
          : `line_http_${response.status}`;
    return { result, error };
  } catch {
    return { result: "RETRY", error: "network_error" };
  }
}
