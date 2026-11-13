import { z } from "zod";
import { extractClientIp } from "./create-case";
import {
  caseCodeSchema,
  normalizePhoneInput,
  THAI_PHONE_REGEX,
  trackingTokenSchema,
  step3BaseSchema,
  priorityScore,
  computeTriage,
  type IncidentType,
  type Need,
  type Urgency,
  WaterLevel,
} from "../../../lib/domain";

export const reporterMutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel"), version: z.number().int().positive() }).strict(),
  step3BaseSchema
    .pick({ adults: true, elderly: true, bedridden: true, children: true, pets: true })
    .extend({
      action: z.literal("update"),
      version: z.number().int().positive(),
      waterLevel: z.enum(WaterLevel).nullable(),
      notes: z.string().trim().max(500, "โน้ตต้องไม่เกิน 500 ตัวอักษร"),
    })
    .strict()
    .refine((d) => d.adults + d.elderly + d.bedridden + d.children > 0, {
      message: "ต้องมีผู้ติดค้างอย่างน้อย 1 คน",
      path: ["adults"],
    }),
]);

export type ReporterDetails = {
  version: number;
  waterLevel: WaterLevel | null;
  notes: string;
  adults: number;
  elderly: number;
  bedridden: number;
  children: number;
  pets: number;
};

type ReporterScoreContext = {
  urgency: Urgency;
  createdAt: string;
  incidentType: IncidentType;
  canSelfEvacuate: boolean;
  dangerSigns: string[];
  hasDisabled: boolean;
  hasInjured: boolean;
  needs: Need[];
  overridden: boolean;
};

export interface ReporterRpcClient {
  rpc(
    fn: "reporter_case_verified",
    args: {
      p_case_code: string;
      p_token: string;
      p_phone: string;
      p_client_ip: string | null;
      p_action: string;
      p_payload: unknown;
    },
  ): PromiseLike<{
    data: ReporterDetails | ReporterScoreContext | null;
    error: { code?: string; message: string; hint?: string | null } | null;
  }>;
}

export async function handleReporterCase(input: {
  caseCode: string;
  token: string;
  phone: string;
  headers: Headers;
  mutation?: unknown;
  supabase: ReporterRpcClient;
}) {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  const code = caseCodeSchema.safeParse(input.caseCode);
  const token = trackingTokenSchema.safeParse(input.token);
  if (!code.success || !token.success)
    return { status: 400, body: { error: "รหัสเคสหรือลิงก์ติดตามไม่ถูกต้อง" }, headers };
  // TF-63: แปลงเบอร์แบบเดียวกับฟอร์ม SOS (+66 → 0) ก่อนเทียบกับเบอร์ที่เก็บไว้
  const phone = normalizePhoneInput(input.phone);
  if (!THAI_PHONE_REGEX.test(phone))
    return { status: 400, body: { error: "กรุณาระบุเบอร์โทรเต็มที่ใช้แจ้งเคส" }, headers };
  const parsed =
    input.mutation === undefined ? null : reporterMutationSchema.safeParse(input.mutation);
  if (parsed && !parsed.success)
    return { status: 400, body: { error: parsed.error.issues[0].message }, headers };
  const mutation = parsed?.success ? parsed.data : null;
  const clientIp = extractClientIp(input.headers);
  const call = (action: string, payload: unknown) =>
    input.supabase.rpc("reporter_case_verified", {
      p_case_code: code.data,
      p_token: token.data,
      p_phone: phone,
      p_client_ip: clientIp,
      p_action: action,
      p_payload: payload,
    });
  let { data, error } = await (mutation?.action === "update"
    ? call("score_context", {})
    : call(mutation?.action ?? "read", mutation ?? {}));
  if (mutation?.action === "update" && data && !error) {
    if (!("urgency" in data))
      return { status: 500, body: { error: "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" }, headers };
    const triage = computeTriage({
      incidentType: data.incidentType,
      dangerSigns: data.dangerSigns,
      waterLevel: mutation.waterLevel ?? undefined,
      canSelfEvacuate: data.canSelfEvacuate,
      elderly: mutation.elderly,
      bedridden: mutation.bedridden,
      children: mutation.children,
      hasDisabled: data.hasDisabled,
      hasInjured: data.hasInjured,
      needs: data.needs,
    });
    const urgency = data.overridden ? data.urgency : triage.level;
    const score = priorityScore({
      urgency,
      incidentType: data.incidentType,
      createdAt: new Date(data.createdAt),
      waterLevel: mutation.waterLevel ?? undefined,
      bedridden: mutation.bedridden,
      elderly: mutation.elderly,
      children: mutation.children,
    });
    ({ data, error } = await call("update", {
      ...mutation,
      previousUrgency: data.urgency,
      urgency,
      systemUrgency: triage.level,
      triageReasons: triage.reasons,
      priorityScore: score,
    }));
  }
  if (error) {
    if (error.code === "SOS29") {
      const seconds = Math.max(1, Number.parseInt(error.hint ?? "900", 10) || 900);
      return {
        status: 429,
        body: {
          error: `ยืนยันข้อมูลผิดหลายครั้ง กรุณารอ ${Math.ceil(seconds / 60)} นาทีแล้วลองใหม่`,
        },
        headers: { ...headers, "Retry-After": String(seconds) },
      };
    }
    const conflict = error.code === "SOS40" || error.code === "SOS41";
    return {
      status: conflict ? 409 : 500,
      body: {
        error:
          error.code === "SOS40"
            ? "เคสนี้ปิดแล้ว ไม่สามารถแก้ไขได้"
            : error.code === "SOS41"
              ? "ข้อมูลเคสเปลี่ยนแล้ว กรุณาโหลดหน้าใหม่ก่อนลองอีกครั้ง"
              : "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
      },
      headers,
    };
  }
  if (data && "urgency" in data)
    return { status: 500, body: { error: "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" }, headers };
  return {
    status: data ? 200 : 404,
    body: data ?? { error: "ข้อมูลยืนยันไม่ถูกต้อง กรุณาตรวจสอบเบอร์โทรและลิงก์ติดตาม" },
    headers,
  };
}
