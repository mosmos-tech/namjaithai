import { timingSafeEqual } from "node:crypto";
import {
  formatMemberLineNotification,
  formatThaiDateTime,
  reporterStatusView,
  trackPath,
  type CaseStatus,
  type MemberReviewDecision,
} from "../../lib/domain";

type Job = {
  id: string;
  lease_id: string;
  line_user_id: string;
  case_code: string;
  tracking_token: string;
  to_status: CaseStatus;
  created_at: string;
};
export interface NotificationClient {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

export function validWorkerAuthorization(header: string | null, secret: string | undefined) {
  if (!secret || secret.length < 16 || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function deliverLineNotifications(input: {
  db: NotificationClient;
  token?: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
}) {
  let origin: string;
  try {
    const url = new URL(input.baseUrl ?? "");
    if (
      (url.protocol !== "https:" &&
        !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) ||
      url.username ||
      url.password
    )
      throw new Error();
    origin = url.origin;
  } catch {
    return { status: 503, body: { error: "ระบบแจ้งเตือนยังไม่ได้ตั้งค่า" } };
  }
  if (!input.token) return { status: 503, body: { error: "ระบบแจ้งเตือนยังไม่ได้ตั้งค่า" } };
  const { data, error } = await input.db.rpc("claim_case_line_notifications");
  if (error) return { status: 500, body: { error: "อ่านคิวแจ้งเตือนไม่สำเร็จ" } };
  const jobs = (data ?? []) as Job[];
  let accepted = 0;
  for (const job of jobs) {
    let result: "SENT" | "RETRY" | "FAILED" = "RETRY";
    let failure: string | null = null;
    try {
      const response = await (input.fetcher ?? fetch)("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.token}`,
          "Content-Type": "application/json",
          "X-Line-Retry-Key": job.id,
        },
        body: JSON.stringify({
          to: job.line_user_id,
          messages: [
            {
              type: "text",
              text: [
                `น้ำใจไทย SOS · เคส ${job.case_code}`,
                `อัปเดตเมื่อ ${formatThaiDateTime(job.created_at)}: ${reporterStatusView(job.to_status).badge}`,
                new URL(trackPath(job.case_code, job.tracking_token), origin).href,
              ].join("\n"),
            },
          ],
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (
        response.ok ||
        (response.status === 409 && response.headers.has("x-line-accepted-request-id"))
      ) {
        result = "SENT";
      } else {
        result = response.status === 429 || response.status >= 500 ? "RETRY" : "FAILED";
        failure = `line_http_${response.status}`;
      }
    } catch {
      failure = "network_error";
    }
    const finished = await input.db.rpc("finish_case_line_notification", {
      p_id: job.id,
      p_lease_id: job.lease_id,
      p_result: result,
      p_error: failure,
    });
    // If acknowledgement fails, the lease expires and the same retry key is reused.
    if (finished.error) return { status: 500, body: { error: "บันทึกผลแจ้งเตือนไม่สำเร็จ" } };
    if (result === "SENT") accepted++;
  }
  return { status: 200, body: { processed: jobs.length, accepted } };
}

type MemberJob = {
  id: string;
  lease_id: string;
  line_user_id: string;
  unit_name: string;
  to_status: MemberReviewDecision;
  expires_at: string | null;
  created_at: string;
};

export async function deliverMemberLineNotifications(input: {
  db: NotificationClient;
  token?: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
}) {
  let origin: string;
  try {
    const url = new URL(input.baseUrl ?? "");
    if (
      (url.protocol !== "https:" &&
        !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) ||
      url.username ||
      url.password
    )
      throw new Error();
    origin = url.origin;
  } catch {
    return { status: 503, body: { error: "ระบบแจ้งเตือนยังไม่ได้ตั้งค่า" } };
  }
  if (!input.token) return { status: 503, body: { error: "ระบบแจ้งเตือนยังไม่ได้ตั้งค่า" } };

  const { data, error } = await input.db.rpc("claim_member_line_notifications");
  if (error) return { status: 500, body: { error: "อ่านคิวแจ้งเตือนสมาชิกไม่สำเร็จ" } };
  const jobs = (data ?? []) as MemberJob[];
  let accepted = 0;

  for (const job of jobs) {
    let result: "SENT" | "RETRY" | "FAILED" = "RETRY";
    let failure: string | null = null;
    try {
      const response = await (input.fetcher ?? fetch)("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.token}`,
          "Content-Type": "application/json",
          "X-Line-Retry-Key": job.id,
        },
        body: JSON.stringify({
          to: job.line_user_id,
          messages: [
            {
              type: "text",
              text: formatMemberLineNotification({
                unitName: job.unit_name,
                decision: job.to_status,
                expiresAt: job.expires_at,
                origin,
              }),
            },
          ],
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (
        response.ok ||
        (response.status === 409 && response.headers.has("x-line-accepted-request-id"))
      ) {
        result = "SENT";
      } else {
        result = response.status === 429 || response.status >= 500 ? "RETRY" : "FAILED";
        failure = `line_http_${response.status}`;
      }
    } catch {
      failure = "network_error";
    }
    const finished = await input.db.rpc("finish_member_line_notification", {
      p_id: job.id,
      p_lease_id: job.lease_id,
      p_result: result,
      p_error: failure,
    });
    if (finished.error) return { status: 500, body: { error: "บันทึกผลแจ้งเตือนสมาชิกไม่สำเร็จ" } };
    if (result === "SENT") accepted++;
  }

  return { status: 200, body: { processed: jobs.length, accepted } };
}
