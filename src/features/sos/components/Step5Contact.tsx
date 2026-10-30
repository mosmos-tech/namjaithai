"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Camera, Trash2, ShieldCheck, Loader2, CheckCircle2 } from "lucide-react";
import {
  compressImageForSos,
  formatFileSizeKb,
  MAX_PHOTO_BYTES,
  MAX_SOS_PHOTOS,
} from "../image-compression";
import type { SosDraftPhoto, Step5ValidationErrors } from "../draft-storage";

interface Step5ContactProps {
  name: string;
  phone: string;
  lineId: string;
  notes: string;
  photos: SosDraftPhoto[];
  errors: Step5ValidationErrors;
  isSubmitting?: boolean;
  submitError?: string | null;
  submitSuccessMessage?: string | null;
  onChangeField: (field: "name" | "phone" | "lineId" | "notes", value: string) => void;
  onAddPhoto: (photo: SosDraftPhoto) => void;
  onRemovePhoto: (photoId: string) => void;
  onPrev: () => void;
  onSubmit: () => void;
}

/**
 * ฟอร์มขอความช่วยเหลือ SOS ขั้นที่ 5: ข้อมูลติดต่อผู้แจ้ง และแนบรูปไม่เกิน 3 รูป
 * - ชื่อ (บังคับ)
 * - เบอร์โทรศัพท์ (บังคับ ตรวจรูปแบบเบอร์ไทย 06x–09x หรือ 02x–05x)
 * - LINE ID (ไม่บังคับ)
 * - รายละเอียดเพิ่มเติม (ไม่บังคับ ไม่เกิน 500 ตัวอักษร)
 * - แนบรูปถ่ายไม่เกิน 3 รูป โดยบีบอัดให้เหลือไม่เกิน 500 KB ต่อรูปก่อนอัปโหลด
 */
export function Step5Contact({
  name,
  phone,
  lineId,
  notes,
  photos,
  errors,
  isSubmitting = false,
  submitError = null,
  submitSuccessMessage = null,
  onChangeField,
  onAddPhoto,
  onRemovePhoto,
  onPrev,
  onSubmit,
}: Step5ContactProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const remainingSlots = Math.max(0, MAX_SOS_PHOTOS - photos.length);

  async function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;

    setPhotoError(null);

    const files = Array.from(fileList);
    if (photos.length + files.length > MAX_SOS_PHOTOS) {
      setPhotoError(`แนบรูปถ่ายได้ไม่เกิน ${MAX_SOS_PHOTOS} รูป (เลือกเพิ่มได้อีก ${remainingSlots} รูป)`);
      event.target.value = "";
      return;
    }

    setIsCompressing(true);
    try {
      for (const file of files) {
        const compressed = await compressImageForSos(file, {
          maxBytes: MAX_PHOTO_BYTES,
        });

        onAddPhoto({
          id: compressed.id,
          name: compressed.name,
          mimeType: compressed.mimeType,
          originalBytes: compressed.originalBytes,
          compressedBytes: compressed.compressedBytes,
          width: compressed.width,
          height: compressed.height,
          dataUrl: compressed.dataUrl,
        });
      }
    } catch (err) {
      setPhotoError(
        err instanceof Error
          ? err.message
          : "เกิดข้อผิดพลาดในการบีบอัดรูปภาพ กรุณาลองใหม่อีกครั้ง",
      );
    } finally {
      setIsCompressing(false);
      event.target.value = "";
    }
  }

  return (
    <div className="space-y-6">
      <section
        aria-labelledby="step5-contact-heading"
        className="space-y-5 rounded-[14px] border border-border-default bg-bg-surface p-5 sm:p-6"
      >
        <div>
          <h2
            id="step5-contact-heading"
            className="font-heading text-xl font-bold text-text-primary sm:text-[22px]"
          >
            5. ข้อมูลติดต่อผู้แจ้งและรูปหน้างาน
          </h2>
          <p className="mt-1 text-base text-text-secondary">
            ระบุชื่อและเบอร์โทรศัพท์เพื่อให้ทีมกู้ภัยติดต่อกลับเมื่อรับเคสแล้ว
          </p>
        </div>

        {/* ป้ายแจ้งความเป็นส่วนตัวตาม CLAUDE.md */}
        <div className="flex items-start gap-3 rounded-[12px] border border-primary-500/30 bg-bg-subtle p-3.5 text-sm text-text-primary">
          <ShieldCheck
            className="mt-0.5 h-5 w-5 shrink-0 text-primary-700"
            aria-hidden="true"
          />
          <p>
            <strong>คุ้มครองข้อมูลส่วนบุคคล:</strong> ชื่อ เบอร์โทร และ LINE ID
            จะเปิดให้เห็นเฉพาะทีมกู้ภัยที่กดรับเคสของคุณและแอดมินเท่านั้น
          </p>
        </div>

        {/* 1. ชื่อผู้แจ้ง */}
        <div>
          <label
            htmlFor="sos-contact-name"
            className="block font-heading text-base font-bold text-text-primary"
          >
            ชื่อผู้แจ้ง หรือชื่อผู้ติดต่อ <span className="text-red-600">*</span>
          </label>
          <input
            id="sos-contact-name"
            data-testid="input-contact-name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => onChangeField("name", e.target.value)}
            placeholder="เช่น สมชาย ใจดี (หรือชื่อเล่น)"
            className="mt-1.5 h-12 min-h-[48px] w-full rounded-[10px] border border-border-strong bg-bg-surface px-4 text-base text-text-primary placeholder:text-text-secondary/70 focus:border-primary-600 focus:outline-none"
          />
          {errors.name && (
            <p
              role="alert"
              data-testid="error-contact-name"
              className="mt-1.5 font-heading text-sm font-semibold text-red-600 sm:text-base"
            >
              • {errors.name}
            </p>
          )}
        </div>

        {/* 2. เบอร์โทรศัพท์ไทย */}
        <div>
          <label
            htmlFor="sos-contact-phone"
            className="block font-heading text-base font-bold text-text-primary"
          >
            เบอร์โทรศัพท์ติดต่อกลับ <span className="text-red-600">*</span>
          </label>
          <p className="mt-0.5 text-sm text-text-secondary">
            รองรับเบอร์มือถือไทย 10 หลัก (06x–09x) หรือเบอร์บ้าน (02x–05x)
          </p>
          <input
            id="sos-contact-phone"
            data-testid="input-contact-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => onChangeField("phone", e.target.value)}
            placeholder="เช่น 0812345678 หรือ 081-234-5678"
            className="mt-1.5 h-12 min-h-[48px] w-full rounded-[10px] border border-border-strong bg-bg-surface px-4 font-mono text-base text-text-primary placeholder:font-sans placeholder:text-text-secondary/70 focus:border-primary-600 focus:outline-none"
          />
          {errors.phone && (
            <p
              role="alert"
              data-testid="error-contact-phone"
              className="mt-1.5 font-heading text-sm font-semibold text-red-600 sm:text-base"
            >
              • {errors.phone}
            </p>
          )}
        </div>

        {/* 3. LINE ID */}
        <div>
          <label
            htmlFor="sos-contact-line-id"
            className="block font-heading text-base font-bold text-text-primary"
          >
            LINE ID <span className="text-sm font-normal text-text-secondary">(ไม่บังคับ)</span>
          </label>
          <input
            id="sos-contact-line-id"
            data-testid="input-contact-line-id"
            type="text"
            value={lineId}
            onChange={(e) => onChangeField("lineId", e.target.value)}
            placeholder="ระบุ LINE ID เผื่อสัญญาณโทรศัพท์ขัดข้อง"
            className="mt-1.5 h-12 min-h-[48px] w-full rounded-[10px] border border-border-strong bg-bg-surface px-4 text-base text-text-primary placeholder:text-text-secondary/70 focus:border-primary-600 focus:outline-none"
          />
        </div>

        {/* 4. รายละเอียดเพิ่มเติม */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label
              htmlFor="sos-contact-notes"
              className="font-heading text-base font-bold text-text-primary"
            >
              รายละเอียดเพิ่มเติม{" "}
              <span className="text-sm font-normal text-text-secondary">(ไม่บังคับ)</span>
            </label>
            <span className="font-mono text-xs font-semibold text-text-secondary">
              {notes.length}/500 ตัวอักษร
            </span>
          </div>
          <textarea
            id="sos-contact-notes"
            data-testid="input-contact-notes"
            rows={3}
            maxLength={500}
            value={notes}
            onChange={(e) => onChangeField("notes", e.target.value.slice(0, 500))}
            placeholder="เช่น อยู่ชั้น 2 เสื้อสีเหลือง, แบตมือถือเหลือ 15%, มีผู้ป่วยโรคหัวใจ..."
            className="mt-1.5 w-full rounded-[10px] border border-border-strong bg-bg-surface p-3 text-base text-text-primary placeholder:text-text-secondary/70 focus:border-primary-600 focus:outline-none"
          />
          {errors.notes && (
            <p
              role="alert"
              data-testid="error-contact-notes"
              className="mt-1.5 font-heading text-sm font-semibold text-red-600"
            >
              • {errors.notes}
            </p>
          )}
        </div>

        {/* 5. แนบรูปถ่ายไม่เกิน 3 รูป (บีบอัดเหลือไม่เกิน 500 KB ก่อนอัปโหลด) */}
        <div className="border-t border-border-default pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-heading text-base font-bold text-text-primary">
                รูปถ่ายหน้างาน{" "}
                <span className="text-sm font-normal text-text-secondary">
                  (ไม่เกิน {MAX_SOS_PHOTOS} รูป · ระบบบีบอัดให้ไม่เกิน 500 KB อัตโนมัติ)
                </span>
              </h3>
              <p className="mt-0.5 text-sm text-text-secondary">
                ถ่ายภาพระดับน้ำหรือตัวบ้านเพื่อให้ทีมกู้ภัยประเมินการเข้าช่วยเหลือได้เร็วขึ้น
              </p>
            </div>
            <span
              data-testid="photo-count-badge"
              className="rounded-full bg-bg-subtle px-3 py-1 font-mono text-xs font-bold text-primary-700"
            >
              {photos.length}/{MAX_SOS_PHOTOS} รูป
            </span>
          </div>

          <input
            ref={fileInputRef}
            id="sos-photo-input"
            data-testid="input-sos-photos"
            type="file"
            accept="image/*"
            multiple
            disabled={remainingSlots === 0 || isCompressing}
            onChange={handleFileSelect}
            className="sr-only"
          />

          {remainingSlots > 0 && (
            <div className="mt-3">
              <button
                type="button"
                data-testid="add-photo-button"
                disabled={isCompressing}
                onClick={() => fileInputRef.current?.click()}
                className="flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-[12px] border-2 border-dashed border-primary-500 bg-primary-50/50 px-4 py-3 font-heading text-base font-semibold text-primary-700 transition-colors hover:bg-primary-50 disabled:opacity-60"
              >
                {isCompressing ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                    <span>กำลังบีบอัดรูปภาพให้ไม่เกิน 500 KB...</span>
                  </>
                ) : (
                  <>
                    <Camera className="h-5 w-5" aria-hidden="true" />
                    <span>แตะเพื่อถ่ายรูปหรือเลือกรูป ({remainingSlots} รูปที่เหลือ)</span>
                  </>
                )}
              </button>
            </div>
          )}

          {(photoError || errors.photos) && (
            <p
              role="alert"
              data-testid="error-contact-photos"
              className="mt-2 font-heading text-sm font-semibold text-red-600"
            >
              • {photoError || errors.photos}
            </p>
          )}

          {/* รายการรูปที่แนบและบีบอัดแล้ว */}
          {photos.length > 0 && (
            <ul className="mt-3 space-y-2.5" data-testid="attached-photos-list">
              {photos.map((photo) => (
                <li
                  key={photo.id}
                  data-testid={`attached-photo-${photo.id}`}
                  className="flex items-center justify-between gap-3 rounded-[12px] border border-border-default bg-bg-page p-2.5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.dataUrl}
                      alt={photo.name}
                      className="h-14 w-14 shrink-0 rounded-[8px] border border-border-default object-cover"
                    />
                    <div className="min-w-0">
                      <p className="truncate font-heading text-sm font-bold text-text-primary">
                        {photo.name}
                      </p>
                      <p className="font-mono text-xs text-green-700">
                        ขนาดหลังบีบอัด: {formatFileSizeKb(photo.compressedBytes)} (จาก{" "}
                        {formatFileSizeKb(photo.originalBytes)})
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    data-testid={`remove-photo-${photo.id}`}
                    aria-label={`ลบรูป ${photo.name}`}
                    onClick={() => onRemovePhoto(photo.id)}
                    className="flex h-12 w-12 min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-full border border-border-strong bg-bg-surface text-red-600 transition-colors hover:bg-red-50"
                  >
                    <Trash2 className="h-5 w-5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* กล่องแจ้งเตือนรวมเมื่อกรอกข้อมูลขั้นที่ 5 ไม่ครบ */}
        {errors.missingSummary.length > 0 && (
          <div
            role="alert"
            data-testid="step5-missing-alert"
            className="rounded-[12px] border border-red-600/30 bg-red-50 p-4 text-base text-red-600"
          >
            <p className="font-heading font-bold">
              ยังส่งคำขอไม่ได้ กรุณาตรวจสอบข้อมูล:
            </p>
            <p className="mt-1 font-medium">
              ต้องแก้ไข: {errors.missingSummary.join(", ")}
            </p>
          </div>
        )}

        {submitError && (
          <div
            role="alert"
            data-testid="step5-submit-error"
            className="rounded-[12px] border border-red-600/30 bg-red-50 p-4 text-base font-medium text-red-600"
          >
            {submitError}
          </div>
        )}

        {submitSuccessMessage && (
          <div
            role="status"
            data-testid="step5-submit-success"
            className="flex items-start gap-3 rounded-[12px] border border-green-700/30 bg-green-50 p-4 text-base text-green-700"
          >
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-heading font-bold">ส่งคำขอความช่วยเหลือสำเร็จ</p>
              <p className="mt-0.5">{submitSuccessMessage}</p>
            </div>
          </div>
        )}
      </section>

      {/* ปุ่มย้อนกลับ / ส่งคำขอความช่วยเหลือ */}
      <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-between">
        <button
          type="button"
          data-testid="step5-prev-button"
          disabled={isSubmitting}
          onClick={onPrev}
          className="flex h-14 min-h-[48px] w-full items-center justify-center rounded-full border border-border-strong bg-bg-surface px-6 font-heading text-[19px] font-semibold text-text-primary transition-colors hover:bg-bg-subtle disabled:opacity-50 sm:w-auto sm:min-w-[160px]"
        >
          ← ย้อนกลับ
        </button>

        <button
          type="button"
          data-testid="step5-submit-button"
          disabled={isSubmitting || isCompressing}
          onClick={onSubmit}
          className="flex h-14 min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-red-600 px-8 font-heading text-[19px] font-bold text-text-on-primary shadow-sm transition-colors hover:bg-red-600/90 active:bg-red-600 disabled:opacity-60 sm:w-auto sm:min-w-[260px]"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              <span>กำลังส่งคำขอ...</span>
            </>
          ) : (
            <span>แจ้งขอความช่วยเหลือทันที</span>
          )}
        </button>
      </div>
    </div>
  );
}
