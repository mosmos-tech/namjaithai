import { timingSafeEqual } from "node:crypto";
import {
  formatCaseStatusLine,
  formatCloseConfirmationLine,
  formatMemberLineNotification,
  formatRedAlertDigestLine,
  formatTransferExpiredLine,
  type CaseStatus,
  type IncidentType,
  type MemberReviewDecision,
  type Urgency,
} from "../../lib/domain";
import { lineDeliveryMode, pushLineText, type PushResult } from "./line-push";
import { selectRedAlertRecipients, type RedAlertCandidate } from "./red-alert";

// ── worker ส่งคิว LINE (TF-43 สถานะเคส, TF-20 ผลอนุมัติ, TF-34 เคสแดง/ยืนยันปิดเคส) ──
// ทุกงานมาจากคิวในฐานข้อมูล การส่ง SOS ไม่รอ LINE; retry/backoff/บันทึกล้มเหลวอยู่ใน finish_* ของคิว

type Job = {
  id: string;
  case_id: string;
  lease_id: string;
  line_user_id: string;
  case_code: string;
  tracking_token: string;
  // แถวจากคิวรุ่นก่อน TF-34 ไม่มี kind = แจ้งสถานะ
  kind?: "CASE_STATUS" | "CLOSE_CONFIRM" | "STALE_UNCLAIMED" | "STALE_TEAM" | "TRANSFER_EXPIRED";
  to_status: CaseStatus | null;
  incident_type?: string | null;
  district?: string | null;
  province?: string | null;
  created_at: string;
  /** TF-63: ภาษาฟอร์มที่ผู้แจ้งใช้ (แถวรุ่นก่อน TF-63 ไม่มี = ไทย) */
  reporter_locale?: "th" | "en" | null;
};

type MemberJob = {
  id: string;
  lease_id: string;
  line_user_id: string;
  unit_name: string;
  to_status: MemberReviewDecision;
  expires_at: string | null;
  created_at: string;
};

type DigestJob = {
  digest_id: string;
  lease_id: string;
  line_user_id: string;
  case_count: number;
  case_code: string;
  incident_type: string | null;
  urgency: Urgency;
  district: string | null;
  province: string | null;
};

export interface NotificationClient {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

export type LineWorkerConfig = {
  db: NotificationClient;
  token?: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
  // NEXT_PUBLIC_APP_ENV: production ส่งจริง / dev, uat ส่งเฉพาะ SUPER_ADMIN_LINE_IDS / อื่นๆ ไม่ส่ง
  appEnv?: string;
  superAdminLineIds?: ReadonlySet<string>;
};

type WorkerResult = { status: number; body: Record<string, unknown> };
type FinishResult = Exclude<PushResult, "QUOTA_EXHAUSTED"> | "SKIPPED" | "RELEASE";

const NOT_CONFIGURED: WorkerResult = {
  status: 503,
  body: { error: "ระบบแจ้งเตือนยังไม่ได้ตั้งค่า" },
};

export function validWorkerAuthorization(header: string | null, secret: string | undefined) {
  if (!secret || secret.length < 16 || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function resolveOrigin(baseUrl: string | undefined): string | null {
  try {
    const url = new URL(baseUrl ?? "");
    if (
      (url.protocol !== "https:" &&
        !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) ||
      url.username ||
      url.password
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

// ส่งจริงหรือข้ามตามสภาพแวดล้อม — log ไม่มีเนื้อหาข้อความหรือ LINE ID
async function sendOrSkip(
  config: LineWorkerConfig,
  token: string,
  to: string,
  text: string,
  retryKey: string,
): Promise<{ result: PushResult | "SKIPPED"; error: string | null }> {
  const mode = lineDeliveryMode(config.appEnv, to, config.superAdminLineIds ?? new Set());
  if (mode === "SKIP") {
    console.info(`[line] ไม่ส่งจริงใน ${config.appEnv ?? "ไม่ระบุ"} (งาน ${retryKey})`);
    return { result: "SKIPPED", error: `skipped_${config.appEnv ?? "unset"}` };
  }
  return pushLineText({ fetcher: config.fetcher, token, to, text, retryKey });
}

/**
 * วนส่งงานที่ claim มา — โควตารายเดือนหมด: งานนั้น FAILED, หยุดทั้งระบบ, คืนงานที่เหลือเข้าคิว
 */
async function deliverClaimed<T>(
  config: LineWorkerConfig,
  token: string,
  jobs: T[],
  describe: (job: T) => { to: string; text: string; retryKey: string },
  finish: (job: T, result: FinishResult, error: string | null) => PromiseLike<{ error: unknown }>,
  failedAckMessage: string,
): Promise<WorkerResult> {
  let accepted = 0;
  for (const [index, job] of jobs.entries()) {
    const { to, text, retryKey } = describe(job);
    const { result, error } = await sendOrSkip(config, token, to, text, retryKey);
    if (result === "QUOTA_EXHAUSTED") {
      await finish(job, "FAILED", error);
      await config.db.rpc("pause_line_delivery", { p_reason: "line_monthly_quota" });
      for (const rest of jobs.slice(index + 1)) await finish(rest, "RELEASE", null);
      return { status: 200, body: { processed: index + 1, accepted, paused: true } };
    }
    const finished = await finish(job, result, error);
    // If acknowledgement fails, the lease expires and the same retry key is reused.
    if (finished.error) return { status: 500, body: { error: failedAckMessage } };
    if (result === "SENT") accepted++;
  }
  return { status: 200, body: { processed: jobs.length, accepted } };
}

export async function deliverLineNotifications(config: LineWorkerConfig): Promise<WorkerResult> {
  const origin = resolveOrigin(config.baseUrl);
  if (!origin || !config.token) return NOT_CONFIGURED;
  const token = config.token;
  const { data, error } = await config.db.rpc("claim_case_line_notifications");
  if (error) return { status: 500, body: { error: "อ่านคิวแจ้งเตือนไม่สำเร็จ" } };
  return deliverClaimed(
    config,
    token,
    (data ?? []) as Job[],
    (job) => {
      const ref = {
        caseCode: job.case_code,
        trackingToken: job.tracking_token,
        incidentType: job.incident_type ?? null,
        district: job.district ?? null,
        province: job.province ?? null,
        origin,
        locale: job.reporter_locale === "en" ? ("en" as const) : ("th" as const),
      };
      return {
        to: job.line_user_id,
        retryKey: job.id,
        text:
          job.kind === "STALE_UNCLAIMED"
            ? [
                `เคส ${job.case_code} ยังไม่มีทีมรับ โปรดตรวจสอบ`,
                `เปิดรายการเคส: ${new URL("/admin/cases", origin).href}`,
              ].join("\n")
            : job.kind === "STALE_TEAM"
              ? [
                  `เคส ${job.case_code} ยังไม่มีการอัปเดต กรุณาตรวจสอบและอัปเดตสถานะหรือโน้ต`,
                  `เปิดงานของฉัน: ${new URL("/rescue/my-tasks", origin).href}`,
                ].join("\n")
              : job.kind === "CLOSE_CONFIRM"
                ? formatCloseConfirmationLine(ref)
                : job.kind === "TRANSFER_EXPIRED"
                  ? formatTransferExpiredLine({ ...ref, caseId: job.case_id })
                  : formatCaseStatusLine({ ...ref, toStatus: job.to_status!, at: job.created_at }),
      };
    },
    (job, result, failure) =>
      config.db.rpc("finish_case_line_notification", {
        p_id: job.id,
        p_lease_id: job.lease_id,
        p_result: result,
        p_error: failure,
      }),
    "บันทึกผลแจ้งเตือนไม่สำเร็จ",
  );
}

export async function deliverMemberLineNotifications(
  config: LineWorkerConfig,
): Promise<WorkerResult> {
  const origin = resolveOrigin(config.baseUrl);
  if (!origin || !config.token) return NOT_CONFIGURED;
  const { data, error } = await config.db.rpc("claim_member_line_notifications");
  if (error) return { status: 500, body: { error: "อ่านคิวแจ้งเตือนสมาชิกไม่สำเร็จ" } };
  return deliverClaimed(
    config,
    config.token,
    (data ?? []) as MemberJob[],
    (job) => ({
      to: job.line_user_id,
      retryKey: job.id,
      text: formatMemberLineNotification({
        unitName: job.unit_name,
        decision: job.to_status,
        expiresAt: job.expires_at,
        origin,
      }),
    }),
    (job, result, failure) =>
      config.db.rpc("finish_member_line_notification", {
        p_id: job.id,
        p_lease_id: job.lease_id,
        p_result: result,
        p_error: failure,
      }),
    "บันทึกผลแจ้งเตือนสมาชิกไม่สำเร็จ",
  );
}

/** เคสแดง: รวมหลายเคสของคนเดียวเป็น 1 ข้อความ (ฐานข้อมูลคุมไม่เกิน 1 ข้อความต่อ 5 นาที) */
export async function deliverRedAlertDigests(config: LineWorkerConfig): Promise<WorkerResult> {
  const origin = resolveOrigin(config.baseUrl);
  if (!origin || !config.token) return NOT_CONFIGURED;
  const { data, error } = await config.db.rpc("claim_red_alert_digests");
  if (error) return { status: 500, body: { error: "อ่านคิวแจ้งเคสแดงไม่สำเร็จ" } };
  return deliverClaimed(
    config,
    config.token,
    (data ?? []) as DigestJob[],
    (job) => ({
      to: job.line_user_id,
      retryKey: job.digest_id,
      text: formatRedAlertDigestLine({
        caseCount: job.case_count,
        latest: {
          caseCode: job.case_code,
          incidentType: job.incident_type,
          urgency: job.urgency,
          district: job.district,
          province: job.province,
        },
        origin,
      }),
    }),
    (job, result, failure) =>
      config.db.rpc("finish_red_alert_digest", {
        p_digest_id: job.digest_id,
        p_lease_id: job.lease_id,
        p_result: result,
        p_error: failure,
      }),
    "บันทึกผลแจ้งเคสแดงไม่สำเร็จ",
  );
}

/** กระจายเคสแดงใหม่เป็นงานรายคน: คัดหน่วยด้วย canUnitHandle() ไม่เกินหน่วยละ 2 คน รวมไม่เกิน 10 คน */
export async function fanOutRedCases(db: NotificationClient): Promise<number> {
  const { data, error } = await db.rpc("claim_red_case_fanouts");
  if (error) throw new Error("claim_red_case_fanouts");
  let queued = 0;
  for (const item of (data ?? []) as {
    case_id: string;
    incident_type: IncidentType;
    required_capabilities?: string[];
  }[]) {
    const candidates = await db.rpc("list_red_alert_candidates", { p_case_id: item.case_id });
    if (candidates.error) throw new Error("list_red_alert_candidates");
    const userIds = selectRedAlertRecipients(
      item.incident_type,
      (candidates.data ?? []) as RedAlertCandidate[],
      undefined,
      item.required_capabilities ?? [],
    );
    const enqueued = await db.rpc("enqueue_red_alerts", {
      p_case_id: item.case_id,
      p_user_ids: userIds,
    });
    if (enqueued.error) throw new Error("enqueue_red_alerts");
    queued += Number(enqueued.data ?? 0);
  }
  return queued;
}

/**
 * รอบทำงานของ worker (เรียกจาก pg_cron ทุกนาที และหลังสร้างเคสด้วย after())
 * โควตาหมด = ไม่ claim อะไรจนถึงต้นเดือนหน้า
 */
export async function runLineNotifications(config: LineWorkerConfig): Promise<WorkerResult> {
  if (!resolveOrigin(config.baseUrl) || !config.token) return NOT_CONFIGURED;
  const paused = await config.db.rpc("is_line_delivery_paused");
  if (paused.error) return { status: 500, body: { error: "อ่านสถานะการส่งไม่สำเร็จ" } };
  if (paused.data === true) return { status: 200, body: { paused: true } };

  let fannedOut = 0;
  try {
    fannedOut = await fanOutRedCases(config.db);
  } catch {
    return { status: 500, body: { error: "กระจายแจ้งเคสแดงไม่สำเร็จ" } };
  }
  const summary: Record<string, unknown> = { fannedOut };
  for (const [name, step] of [
    ["cases", deliverLineNotifications],
    ["redAlerts", deliverRedAlertDigests],
    ["members", deliverMemberLineNotifications],
  ] as const) {
    const result = await step(config);
    if (result.status !== 200) return result;
    summary[name] = result.body;
    if (result.body.paused) return { status: 200, body: { ...summary, paused: true } };
  }
  return { status: 200, body: summary };
}
