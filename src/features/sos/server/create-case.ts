import { z } from "zod";
import {
  sosSchema,
  priorityScore,
  type SosFormData,
  type CaseStatus,
} from "../../../lib/domain";

export interface CreateSosCaseRpcRow {
  case_id: string;
  case_code: string;
  tracking_token: string;
  status: CaseStatus;
  created_at: string;
  replayed: boolean;
}

export interface CreateSosCaseRpcError {
  code?: string;
  message: string;
  details?: string | null;
  hint?: string | null;
}

/**
 * อินเทอร์เฟซขั้นต่ำของ Supabase client ที่ใช้เรียก RPC create_sos_case
 * แยกไว้เพื่อให้ส่ง mock เข้ามาทดสอบด้วย Vitest ได้โดยไม่ต้องต่อฐานข้อมูลจริงใน unit test
 */
export interface SosCaseRpcClient {
  rpc(
    fn: "create_sos_case",
    args: {
      p_idempotency_key: string;
      p_payload: SosFormData;
      p_priority_score: number;
      p_client_ip: string | null;
      p_reporter_user_id: string | null;
    },
  ): PromiseLike<{
    data: CreateSosCaseRpcRow[] | null;
    error: CreateSosCaseRpcError | null;
  }>;
}

export interface CreateSosCaseSuccessResponse {
  caseId: string;
  caseCode: string;
  trackingToken: string;
  status: CaseStatus;
  priorityScore: number;
  createdAt: string;
  replayed: boolean;
}

export interface CreateSosCaseValidationErrorResponse {
  error: string;
  fieldErrors: Record<string, string[] | undefined>;
  formErrors: string[];
  fields: string[];
}

export interface CreateSosCaseRateLimitErrorResponse {
  error: string;
  retryAfterSeconds: number;
}

export type CreateSosCaseResult =
  | {
      status: 200 | 201;
      body: CreateSosCaseSuccessResponse;
      headers?: Record<string, string>;
    }
  | {
      status: 400;
      body: CreateSosCaseValidationErrorResponse;
      headers?: Record<string, string>;
    }
  | {
      status: 429;
      body: CreateSosCaseRateLimitErrorResponse;
      headers: Record<string, string>;
    }
  | {
      status: 500;
      body: { error: string };
      headers?: Record<string, string>;
    };

const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

/**
 * ดึง IP ของผู้ส่งจาก HTTP headers (รองรับทั้ง Vercel / Reverse Proxy)
 */
export function extractClientIp(headers: Headers): string | null {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }

  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  return null;
}

/**
 * ดึงและตรวจค่า Idempotency-Key จาก HTTP Header (หรือสร้าง UUID อัตโนมัติถ้าไม่ได้ส่งหัวมา)
 * - ถ้าผู้ส่งระบุหัว Idempotency-Key มาเป็นค่าว่างเปล่า หรือยาวเกิน 128 ตัวอักษร จะตีกลับเป็นผิดพลาด
 */
export function resolveIdempotencyKey(
  headers: Headers,
): { ok: true; key: string } | { ok: false; message: string } {
  const rawHeader = headers.get("idempotency-key");

  if (rawHeader === null) {
    return { ok: true, key: crypto.randomUUID() };
  }

  const trimmed = rawHeader.trim();
  if (trimmed.length === 0) {
    return {
      ok: false,
      message: "หัวข้อมูล Idempotency-Key ห้ามเป็นค่าว่าง",
    };
  }

  if (trimmed.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    return {
      ok: false,
      message: `หัวข้อมูล Idempotency-Key ต้องยาวไม่เกิน ${MAX_IDEMPOTENCY_KEY_LENGTH} ตัวอักษร`,
    };
  }

  return { ok: true, key: trimmed };
}

/**
 * ฟังก์ชันหลักสำหรับตรวจสอบข้อมูลฟอร์ม SOS คำนวณคะแนนความเร่งด่วน
 * และเรียกฟังก์ชัน create_sos_case() ในฐานข้อมูลเพื่อบันทึกทุกตารางในครั้งเดียว
 */
export async function handleCreateSosCase(params: {
  rawBody: unknown;
  headers: Headers;
  supabase: SosCaseRpcClient;
  reporterUserId?: string | null;
  now?: Date;
}): Promise<CreateSosCaseResult> {
  const { rawBody, headers, supabase, reporterUserId = null, now = new Date() } = params;

  // 1. ตรวจว่าข้อมูลที่ส่งมาเป็น Object และผ่านกติกา sosSchema จาก src/lib/domain
  if (typeof rawBody !== "object" || rawBody === null || Array.isArray(rawBody)) {
    return {
      status: 400,
      body: {
        error: "รูปแบบข้อมูลไม่ถูกต้อง กรุณาส่งเป็น JSON Object",
        fieldErrors: {},
        formErrors: ["รูปแบบข้อมูลไม่ถูกต้อง กรุณาส่งเป็น JSON Object"],
        fields: [],
      },
    };
  }

  const parsed = sosSchema.safeParse(rawBody);
  if (!parsed.success) {
    const flattened = z.flattenError(parsed.error);
    const fields = Object.keys(flattened.fieldErrors);
    return {
      status: 400,
      body: {
        error: "ข้อมูลไม่ครบถ้วนหรือไม่ถูกต้อง",
        fieldErrors: flattened.fieldErrors,
        formErrors: flattened.formErrors,
        fields,
      },
    };
  }

  // 2. ตรวจหัว Idempotency-Key สำหรับกันการกดส่งซ้ำหรือส่งซ้ำตอนเน็ตหลุด
  const idempotency = resolveIdempotencyKey(headers);
  if (!idempotency.ok) {
    return {
      status: 400,
      body: {
        error: idempotency.message,
        fieldErrors: {
          "Idempotency-Key": [idempotency.message],
        },
        formErrors: [],
        fields: ["Idempotency-Key"],
      },
    };
  }

  const formData = parsed.data;

  // 3. คำนวณคะแนนความเร่งด่วนด้วยฟังก์ชันกลาง priorityScore() จาก src/lib/domain
  const score = priorityScore(
    {
      urgency: formData.urgency,
      waterLevel: formData.waterLevel,
      bedridden: formData.bedridden,
      elderly: formData.elderly,
      children: formData.children,
      createdAt: now,
    },
    now,
  );

  const clientIp = extractClientIp(headers);

  // 4. เรียกฟังก์ชัน create_sos_case() ใน PostgreSQL เพื่อบันทึกทุกตารางใน transaction เดียว
  const { data, error } = await supabase.rpc("create_sos_case", {
    p_idempotency_key: idempotency.key,
    p_payload: formData,
    p_priority_score: score,
    p_client_ip: clientIp,
    p_reporter_user_id: reporterUserId,
  });

  if (error) {
    // กรณีส่งถี่เกินกำหนด (รหัส SOS29 จากฟังก์ชัน create_sos_case)
    if (error.code === "SOS29") {
      const retryAfterSeconds = Math.max(1, Number.parseInt(error.hint ?? "60", 10) || 60);
      const isPhoneLimit = error.details === "phone";
      return {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSeconds),
        },
        body: {
          error: isPhoneLimit
            ? "เบอร์โทรศัพท์นี้ส่งคำขอเกินจำนวนที่กำหนด (ไม่เกิน 5 ครั้งต่อชั่วโมง) กรุณารอสักครู่หรือโทรสายด่วน 1669 / 1784"
            : "เครือข่ายนี้ส่งคำขอเกินจำนวนที่กำหนด (ไม่เกิน 20 ครั้งต่อชั่วโมง) กรุณารอสักครู่หรือโทรสายด่วน 1669 / 1784",
          retryAfterSeconds,
        },
      };
    }

    return {
      status: 500,
      body: {
        error: "ไม่สามารถบันทึกคำขอความช่วยเหลือได้ในขณะนี้ กรุณาลองใหม่อีกครั้งหรือโทร 1669 / 1784",
      },
    };
  }

  const row = data?.[0];
  if (!row) {
    return {
      status: 500,
      body: {
        error: "ไม่ได้รับข้อมูลเคสกลับมาจากฐานข้อมูล",
      },
    };
  }

  return {
    status: row.replayed ? 200 : 201,
    body: {
      caseId: row.case_id,
      caseCode: row.case_code,
      trackingToken: row.tracking_token,
      status: row.status,
      priorityScore: score,
      createdAt: row.created_at,
      replayed: row.replayed,
    },
  };
}
