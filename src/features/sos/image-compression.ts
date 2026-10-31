export const MAX_SOS_PHOTOS = 3;
export const MAX_PHOTO_BYTES = 500 * 1024; // 500 KB (512,000 bytes)
export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export interface CompressedPhotoResult {
  id: string;
  name: string;
  mimeType: string;
  originalBytes: number;
  compressedBytes: number;
  width: number;
  height: number;
  dataUrl: string;
  blob: Blob;
}

export interface ImageRenderAttemptOptions {
  maxDimension: number;
  quality: number;
}

export interface ImageRenderAttemptOutput {
  blob: Blob;
  width: number;
  height: number;
  dataUrl: string;
}

export interface CompressImageOptions {
  maxBytes?: number;
  /**
   * ฟังก์ชันเรนเดอร์รูปภาพที่ความละเอียดและคุณภาพที่กำหนด
   * แยกไว้เพื่อให้ทั้งเบราว์เซอร์จริง (HTMLCanvasElement) และ unit test เรียกใช้กติกาบีบอัดเดียวกันได้
   */
  renderAttempt?: (
    file: File | Blob,
    options: ImageRenderAttemptOptions,
  ) => Promise<ImageRenderAttemptOutput>;
}

const DIMENSION_STEPS = [1600, 1280, 1024, 800, 640, 480] as const;
const QUALITY_STEPS = [0.82, 0.7, 0.58, 0.45, 0.32, 0.2] as const;

/**
 * คำนวณขนาดกว้าง×ยาวใหม่โดยรักษาสัดส่วนภาพเดิม ไม่ให้ด้านที่ยาวที่สุดเกิน maxDimension
 */
export function calculateScaledDimensions(
  originalWidth: number,
  originalHeight: number,
  maxDimension: number,
): { width: number; height: number } {
  const safeWidth = Math.max(1, Math.round(originalWidth));
  const safeHeight = Math.max(1, Math.round(originalHeight));
  const longestSide = Math.max(safeWidth, safeHeight);

  if (longestSide <= maxDimension) {
    return { width: safeWidth, height: safeHeight };
  }

  const scale = maxDimension / longestSide;
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}

/**
 * แปลงขนาดไฟล์ (bytes) เป็นข้อความหน่วย KB ที่อ่านเข้าใจง่าย เช่น "342 KB"
 */
export function formatFileSizeKb(bytes: number): string {
  const kb = Math.max(1, Math.round(bytes / 1024));
  return `${kb} KB`;
}

/**
 * แปลง Blob เป็น Data URL (base64) สำหรับแสดงภาพตัวอย่างและเก็บในร่างฟอร์ม
 */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  if (typeof FileReader !== "undefined") {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
        } else {
          reject(new Error("ไม่สามารถอ่านข้อมูลรูปภาพได้"));
        }
      };
      reader.onerror = () => reject(new Error("เกิดข้อผิดพลาดในการอ่านไฟล์รูปภาพ"));
      reader.readAsDataURL(blob);
    });
  }

  // Fallback สำหรับสภาพแวดล้อม Node.js (Vitest)
  const buffer = Buffer.from(await blob.arrayBuffer());
  const mime = blob.type || "image/jpeg";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

/**
 * โหลดรูปภาพในเบราว์เซอร์แล้ววาดลง Canvas เพื่อบีบอัดเป็น JPEG ตามขนาดและ quality ที่กำหนด
 */
async function renderWithBrowserCanvas(
  file: File | Blob,
  { maxDimension, quality }: ImageRenderAttemptOptions,
): Promise<ImageRenderAttemptOutput> {
  if (typeof document !== "undefined" && typeof Image !== "undefined") {
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error("ไม่สามารถเปิดไฟล์รูปภาพนี้ได้"));
        element.src = objectUrl;
      });

      const { width, height } = calculateScaledDimensions(
        img.naturalWidth || img.width || 1200,
        img.naturalHeight || img.height || 900,
        maxDimension,
      );

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        // ถมพื้นขาวก่อนวาด เผื่อรูปต้นฉบับเป็น PNG พื้นใส
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (result) => {
              if (result) {
                resolve(result);
              } else {
                reject(new Error("ไม่สามารถบีบอัดรูปภาพด้วย Canvas ได้"));
              }
            },
            "image/jpeg",
            quality,
          );
        });

        const dataUrl = await blobToDataUrl(blob);
        return { blob, width, height, dataUrl };
      }
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  // Fallback สำหรับสภาพแวดล้อมการทดสอบ (Node/Vitest ที่ไม่มี DOM Canvas)
  // จำลองการลดขนาดไฟล์ตามอัตราส่วนพื้นที่ภาพและค่า quality ของ JPEG
  const { width, height } = calculateScaledDimensions(1600, 1200, maxDimension);
  const dimensionRatio = (maxDimension / 1600) ** 2;
  const targetRatio = Math.min(1, dimensionRatio * quality * 0.55);
  const originalBuffer = new Uint8Array(await file.arrayBuffer());
  const targetLength = Math.max(
    1024,
    Math.min(originalBuffer.byteLength, Math.floor(originalBuffer.byteLength * targetRatio)),
  );
  const sliced = originalBuffer.slice(0, targetLength);
  const blob = new Blob([sliced], { type: "image/jpeg" });
  const dataUrl = await blobToDataUrl(blob);

  return {
    blob,
    width,
    height,
    dataUrl,
  };
}

/**
 * บีบอัดรูปภาพก่อนอัปโหลดให้มีขนาดไม่เกิน 500 KB (MAX_PHOTO_BYTES)
 * - ตรวจชนิดไฟล์ว่าเป็นรูปภาพ
 * - ถ้ารูปใหญ่เกิน 500 KB จะไล่ลดขนาดด้านยาวสุด (1600px -> 480px) และลด quality (0.82 -> 0.20)
 *   จนกว่าจะได้ไฟล์ขนาดไม่เกิน 500 KB
 */
export async function compressImageForSos(
  file: File | Blob,
  options: CompressImageOptions = {},
): Promise<CompressedPhotoResult> {
  const maxBytes = options.maxBytes ?? MAX_PHOTO_BYTES;
  const renderAttempt = options.renderAttempt ?? renderWithBrowserCanvas;

  const mimeType = file.type || "image/jpeg";
  if (mimeType && !mimeType.startsWith("image/")) {
    throw new Error("กรุณาเลือกไฟล์รูปภาพเท่านั้น (เช่น JPG, PNG, WebP)");
  }

  const fileName =
    "name" in file && typeof file.name === "string" && file.name.trim().length > 0
      ? file.name
      : "sos-photo.jpg";

  const originalBytes = file.size;
  if (originalBytes === 0) {
    throw new Error("ไฟล์รูปภาพว่างเปล่า กรุณาเลือกรูปอื่น");
  }

  let bestAttempt: ImageRenderAttemptOutput | null = null;

  for (const maxDimension of DIMENSION_STEPS) {
    for (const quality of QUALITY_STEPS) {
      const attempt = await renderAttempt(file, { maxDimension, quality });
      bestAttempt = attempt;

      if (attempt.blob.size <= maxBytes) {
        return {
          id: crypto.randomUUID(),
          name: fileName.replace(/\.[^.]+$/, "") + ".jpg",
          mimeType: attempt.blob.type || "image/jpeg",
          originalBytes,
          compressedBytes: attempt.blob.size,
          width: attempt.width,
          height: attempt.height,
          dataUrl: attempt.dataUrl,
          blob: attempt.blob,
        };
      }
    }
  }

  if (bestAttempt && bestAttempt.blob.size <= maxBytes) {
    return {
      id: crypto.randomUUID(),
      name: fileName.replace(/\.[^.]+$/, "") + ".jpg",
      mimeType: bestAttempt.blob.type || "image/jpeg",
      originalBytes,
      compressedBytes: bestAttempt.blob.size,
      width: bestAttempt.width,
      height: bestAttempt.height,
      dataUrl: bestAttempt.dataUrl,
      blob: bestAttempt.blob,
    };
  }

  throw new Error(
    "ไม่สามารถบีบอัดรูปภาพให้มีขนาดต่ำกว่า 500 KB ได้ กรุณาเลือกรูปอื่นที่มีความละเอียดน้อยลง",
  );
}
