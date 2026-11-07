import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { MAX_PHOTO_BYTES, MAX_SOS_PHOTOS } from "../image-compression";

export type CasePhoto = { bytes: Buffer; hash: string };

/** Validate all uploads before creating the SOS. Browser compression produces JPEG. */
export async function parseCasePhotos(value: unknown): Promise<CasePhoto[]> {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_SOS_PHOTOS)
    throw new Error("แนบรูปได้ไม่เกิน 3 รูป");
  return Promise.all(
    value.map(async (photo) => {
      if (typeof photo !== "string" || photo.length > Math.ceil(MAX_PHOTO_BYTES / 3) * 4 + 32)
        throw new Error("รูปถ่ายต้องมีขนาดไม่เกิน 500 KB");
      const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(photo);
      if (!match || match[1].length % 4 !== 0)
        throw new Error("รูปถ่ายต้องเป็นไฟล์ JPEG ที่ถูกต้อง");
      const bytes = Buffer.from(match[1], "base64");
      if (
        bytes.length < 4 ||
        bytes.length > MAX_PHOTO_BYTES ||
        bytes.toString("base64") !== match[1] ||
        bytes[0] !== 0xff ||
        bytes[1] !== 0xd8 ||
        bytes.at(-2) !== 0xff ||
        bytes.at(-1) !== 0xd9
      ) {
        throw new Error("รูปถ่ายต้องเป็นไฟล์ JPEG ที่ถูกต้องและไม่เกิน 500 KB");
      }
      try {
        const decoder = sharp(bytes, { limitInputPixels: 16_000_000, failOn: "error" });
        const metadata = await decoder.metadata();
        if (metadata.format !== "jpeg" || !metadata.width || !metadata.height)
          throw new Error("invalid JPEG");
        await decoder.resize(1, 1).raw().toBuffer();
      } catch {
        throw new Error("ไม่สามารถเปิดรูป JPEG ได้ กรุณาเลือกรูปใหม่");
      }
      return { bytes, hash: createHash("sha256").update(bytes).digest("hex") };
    }),
  );
}

export function photoFingerprint(photos: CasePhoto[]): string {
  return createHash("sha256")
    .update(photos.map((photo) => photo.hash).join(":"), "utf8")
    .digest("hex");
}

export async function saveCasePhotos(
  supabase: SupabaseClient,
  caseId: string,
  photos: CasePhoto[],
): Promise<"ok" | "limit"> {
  for (const photo of photos) {
    const path = `${caseId}/${photo.hash}.jpg`;
    const { error: reserveError } = await supabase.rpc("reserve_case_photo", {
      p_case_id: caseId,
      p_path: path,
      p_size: photo.bytes.length,
    });
    if (reserveError?.code === "SOS24") return "limit";
    if (reserveError) throw reserveError;
    const bucket = supabase.storage.from("case-media");
    const { error: uploadError } = await bucket.upload(path, photo.bytes, {
      contentType: "image/jpeg",
      upsert: false,
    });
    if (uploadError) {
      // A previous attempt may have uploaded the same content before its response was lost.
      const { data: exists, error: existsError } = await bucket.exists(path);
      if (existsError || !exists) throw uploadError;
    }
  }
  return "ok";
}
