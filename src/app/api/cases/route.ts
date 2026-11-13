import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runLineNotifications } from "@/features/notifications/line-worker";
import { lineWorkerConfigFromEnv } from "@/features/notifications/server/line-config";
import { getCurrentAppUser } from "@/features/auth/server/app-user";
import { handleCreateSosCase, type SosCaseRpcClient } from "@/features/sos/server/create-case";
import {
  parseCasePhotos,
  photoFingerprint,
  saveCasePhotos,
} from "@/features/sos/server/case-photos";

const MAX_BODY_BYTES = 2_200_000;

async function readBoundedJson(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) throw new RangeError("request too large");
  if (!request.body) throw new SyntaxError("empty body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new RangeError("request too large");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/**
 * POST /api/cases
 * รับข้อมูลจากฟอร์มแจ้งขอความช่วยเหลือ SOS 5 ขั้น:
 * 1. ตรวจสอบข้อมูลด้วย sosSchema (ตอบ 400 พร้อมรายชื่อช่องที่ผิดเมื่อข้อมูลไม่ครบ/ผิดรูปแบบ)
 * 2. คำนวณระดับด้วย computeTriage() (TF-55) แล้วคำนวณคะแนนจัดลำดับด้วย priorityScore()
 * 3. บันทึกทุกตารางในครั้งเดียวผ่านฟังก์ชันฐานข้อมูล create_sos_case()
 * 4. ป้องกันการส่งซ้ำด้วยหัวข้อมูล Idempotency-Key และจำกัดจำนวนครั้งต่อเบอร์โทร/IP
 */
export async function POST(request: Request): Promise<Response> {
  let rawBody: unknown;

  try {
    rawBody = await readBoundedJson(request);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof RangeError
            ? "ขนาดข้อมูลรวมใหญ่เกินกำหนด"
            : "รูปแบบ JSON ในคำขอไม่ถูกต้อง",
        fieldErrors: {},
        formErrors: ["รูปแบบ JSON ในคำขอไม่ถูกต้อง"],
        fields: [],
      },
      { status: error instanceof RangeError ? 413 : 400 },
    );
  }

  let photos: Awaited<ReturnType<typeof parseCasePhotos>>;
  try {
    photos = await parseCasePhotos(
      typeof rawBody === "object" && rawBody !== null && !Array.isArray(rawBody)
        ? (rawBody as Record<string, unknown>).photos
        : undefined,
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "รูปถ่ายไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return Response.json(
      {
        error: "ระบบฐานข้อมูลยังตั้งค่าไม่สมบูรณ์ กรุณาตรวจสอบ SUPABASE_SECRET_KEY",
      },
      { status: 500 },
    );
  }

  const supabase: SosCaseRpcClient = {
    rpc(_name, args) {
      return admin.rpc(
        photos.length ? "create_sos_case_with_photos" : "create_sos_case",
        photos.length ? { ...args, p_photo_fingerprint: photoFingerprint(photos) } : args,
      ) as unknown as ReturnType<SosCaseRpcClient["rpc"]>;
    },
  };

  const result = await handleCreateSosCase({
    rawBody,
    headers: request.headers,
    supabase,
    // Ownership is derived from the verified session, never from request JSON.
    reporterUserId: await getCurrentAppUser().then((user) =>
      user?.status === "ACTIVE" ? user.id : null,
    ),
  });

  // Schedule as soon as the case is created, including when a photo upload later needs retrying.
  // A replay returns 200, so retries do not wake the worker again.
  if (result.status === 201 && process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN) {
    after(async () => {
      try {
        await runLineNotifications(lineWorkerConfigFromEnv(new URL(request.url).origin));
      } catch {
        // The notification stays queued for the scheduled worker.
      }
    });
  }

  // TF-74: 409 ส่งแค่ว่าพบเคสที่อาจซ้ำแบบไหน + ทางเลือก — ไม่มีรหัส/ลิงก์/ข้อมูลใดๆ ของเคสเดิม
  if (result.status === 409) {
    const { code, error, matchReason, options } = result.body;
    return Response.json({ code, error, matchReason, options }, { status: 409 });
  }
  if (result.status !== 200 && result.status !== 201) {
    return Response.json(result.body, { status: result.status, headers: result.headers });
  }

  const body = result.body;
  // TF-74: เบอร์เดิมจากเครื่องอื่น — บันทึกเป็นรายงานเพิ่มเติมให้ทีมแล้ว ไม่คืนรหัสเคส/ลิงก์ติดตาม
  if ("supplemented" in body) {
    if (photos.length) {
      try {
        await saveCasePhotos(admin, body.caseId, photos);
      } catch {
        return Response.json(
          { error: "ส่งข้อมูลเพิ่มให้ทีมแล้ว แต่รูปยังส่งไม่สำเร็จ กรุณากดส่งอีกครั้งเพื่อส่งรูป" },
          { status: 503 },
        );
      }
    }
    return Response.json(
      { supplemented: true, replayed: body.replayed },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  // TF-74: ส่งกลับเฉพาะเคสของผู้แจ้งเอง — ไม่มี id ภายในหรือรหัส/ระยะของเคสที่อาจซ้ำ
  const publicBody = {
    caseCode: body.caseCode,
    trackingToken: body.trackingToken,
    status: body.status,
    createdAt: body.createdAt,
    replayed: body.replayed,
    ...(body.updatedExisting !== undefined ? { updatedExisting: body.updatedExisting } : {}),
  };

  // The separate confirmation capability is returned only on a newly created case or its
  // authenticated idempotent replay; updating somebody else's duplicate must never disclose it.
  let confirmationToken: string | undefined;
  if ((result.status === 201 || body.replayed) && !body.updatedExisting) {
    const secret = await admin.rpc("confirmation_secret_for_case", {
      p_case_code: body.caseCode,
    });
    if (secret.error || typeof secret.data !== "string") {
      return Response.json(
        {
          error: `คำขอ ${body.caseCode} ถึงระบบแล้ว แต่ยังเตรียมสิทธิ์ยืนยันไม่สำเร็จ กรุณากดส่งอีกครั้ง`,
          caseCode: body.caseCode,
          trackingToken: body.trackingToken,
        },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    confirmationToken = secret.data;
  }

  if (photos.length) {
    try {
      const outcome = await saveCasePhotos(admin, body.caseId, photos);
      if (outcome === "limit")
        return Response.json(
          {
            ...publicBody,
            confirmationToken,
            photoWarning: "ส่งรูปบางส่วนไม่ได้ เพราะเคสมีรูปครบ 3 รูปแล้ว",
          },
          { status: result.status },
        );
    } catch {
      return Response.json(
        {
          error: `คำขอ ${body.caseCode} ถึงระบบแล้ว แต่รูปยังส่งไม่สำเร็จ กรุณากดส่งอีกครั้งเพื่อส่งรูป`,
          caseCode: body.caseCode,
          trackingToken: body.trackingToken,
          confirmationToken,
          photosPending: true,
        },
        { status: 503 },
      );
    }
  }

  return Response.json(confirmationToken ? { ...publicBody, confirmationToken } : publicBody, {
    status: result.status,
    headers: result.headers,
  });
}
