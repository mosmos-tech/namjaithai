import { z } from "zod";
import { extractClientIp } from "./create-case";
import {
  caseCodeSchema,
  trackingTokenSchema,
  step3BaseSchema,
  WaterLevel,
} from "../../../lib/domain";

export const reporterMutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel"), version: z.number().int().positive() }).strict(),
  step3BaseSchema
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
    data: ReporterDetails | null;
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
  const phone = input.phone.replace(/[\s-]/g, "");
  if (!/^(0[6-9]\d{8}|0[2-5]\d{7,8})$/.test(phone))
    return { status: 400, body: { error: "กรุณาระบุเบอร์โทรเต็มที่ใช้แจ้งเคส" }, headers };
  const parsed =
    input.mutation === undefined ? null : reporterMutationSchema.safeParse(input.mutation);
  if (parsed && !parsed.success)
    return { status: 400, body: { error: parsed.error.issues[0].message }, headers };
  const payload = parsed?.success ? parsed.data : {};
  const { data, error } = await input.supabase.rpc("reporter_case_verified", {
    p_case_code: code.data,
    p_token: token.data,
    p_phone: phone,
    p_client_ip: extractClientIp(input.headers),
    p_action: parsed?.success ? parsed.data.action : "read",
    p_payload: payload,
  });
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
  return {
    status: data ? 200 : 404,
    body: data ?? { error: "ข้อมูลยืนยันไม่ถูกต้อง กรุณาตรวจสอบเบอร์โทรและลิงก์ติดตาม" },
    headers,
  };
}
