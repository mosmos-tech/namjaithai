"use client";

/* eslint-disable @next/next/no-img-element -- ไอคอน SVG จาก Figma */
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  parseGoogleMapsUrl,
  isInaccurateGps,
  LocationSource,
  type AdminArea,
  type AreaBounds,
  type LocatedArea,
} from "../../../lib/domain";
import {
  getGpsStatusMessage,
  type GpsErrorCode,
  type ManualLocationSource,
  type SosDraft,
  type Step3ValidationErrors,
} from "../draft-storage";
import { isIosDevice, startGpsRefine, type GpsFix } from "../gps-refine";
import { SosStepActions } from "./SosStepActions";
import { useI18n } from "../../../lib/i18n/I18nProvider";
import { format } from "../../../lib/i18n/locale";

/**
 * โหลดแผนที่ MapLibre เฉพาะตอนที่ผู้ใช้เปิดขั้นที่ 3 เท่านั้น (เกณฑ์ผ่านข้อ 4 ของ TF-09)
 * ไม่โหลดชุดโค้ดแผนที่ตั้งแต่ขั้นที่ 1 เพื่อให้หน้าแรกเปิดได้เร็วแม้เน็ตช้า
 */
const LazyStep3LocationMap = dynamic(() => import("./Step3LocationMap"), {
  ssr: false,
  loading: () => <MapLoading />,
});

function MapLoading() {
  const { t } = useI18n();
  return (
    <div
      data-testid="step3-map-loading"
      className="border-border-default bg-primary-50 lg:bg-bg-subtle text-text-secondary flex h-[200px] w-full items-center justify-center rounded-[14px] border text-base lg:h-[300px]"
    >
      {t.step3.mapLoading}
    </div>
  );
}

// ค่าที่ไม่เปลี่ยนระหว่างใช้งาน (เช่น เป็น iPhone ไหม) — อ่านในเบราว์เซอร์ ฝั่งเซิร์ฟเวอร์ได้ false
const subscribeNever = () => () => {};

function subscribeConnection(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export interface Step3LocationProps {
  draft: SosDraft;
  errors: Step3ValidationErrors;
  onGpsPosition: (coords: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  }) => void;
  onManualPin: (coords: { lat: number; lng: number }, source?: ManualLocationSource) => void;
  onAutoFillArea: (area: LocatedArea) => void;
  onUpdateField: (patch: Partial<SosDraft>) => void;
  onPrev: () => void;
  onNext: () => void;
}

/**
 * ขั้นที่ 3 ของฟอร์ม SOS: พิกัดและที่อยู่ (TF-09) ตาม Figma (B2 จอคอม / MB2 มือถือ)
 * - ปุ่มดึงพิกัด GPS อัตโนมัติ ย้ายหมุดไปตำแหน่งปัจจุบัน
 * - แจ้งเตือนเมื่อความแม่นยำเกิน 100 ม. ให้ปักหมุดเพิ่มบนแผนที่
 * - แม้ไม่อนุญาต GPS ก็ยังแตะหรือลากหมุดปักเองบนแผนที่ได้
 * - กรอกจังหวัด/อำเภอ/ตำบลอัตโนมัติจากพิกัดผ่าน /api/geo/reverse และแก้เองได้
 * - TF-65: GPS คลาดเคลื่อนเกิน 1000 ม. ไม่ปักหมุดให้ ผู้แจ้งต้องปักเอง วางลิงก์ หรือกด
 *   "ปักหมุดไม่ได้ ส่งพร้อมที่อยู่แทน" แล้วกรอกที่อยู่ (ไม่บล็อกการขอความช่วยเหลือ)
 * - ช่องจุดสังเกต (บังคับ)
 */
export function Step3Location({
  draft,
  errors,
  onGpsPosition,
  onManualPin,
  onAutoFillArea,
  onUpdateField,
  onPrev,
  onNext,
}: Step3LocationProps) {
  const online = useSyncExternalStore(subscribeConnection, () => navigator.onLine, () => false);
  const { t, locale } = useI18n();
  const [isLocating, setIsLocating] = useState(false);
  // TF-67: ค่าที่แม่นที่สุดระหว่างรอ GPS แม่นขึ้น (ยังไม่ปักหมุด)
  const [refineBest, setRefineBest] = useState<GpsFix | null>(null);
  const stopGpsRef = useRef<(() => void) | null>(null);
  const ios = useSyncExternalStore(subscribeNever, () => isIosDevice(navigator), () => false);
  const [gpsError, setGpsError] = useState<GpsErrorCode | null>(null);
  const [gmapsError, setGmapsError] = useState<string | null>(null);
  const [isResolvingGmaps, setIsResolvingGmaps] = useState(false);
  // กรอบตำบลที่ผู้แจ้งเลือกเอง ให้แผนที่เลื่อนไปที่นั่น (TF-65)
  const [focusBounds, setFocusBounds] = useState<AreaBounds | undefined>();

  const [provinces, setProvinces] = useState<AdminArea[]>([]);
  const [districts, setDistricts] = useState<AdminArea[]>([]);
  const [subdistricts, setSubdistricts] = useState<AdminArea[]>([]);

  // โหลดรายชื่อจังหวัดเมื่อเปิดขั้นที่ 3
  useEffect(() => {
    let cancelled = false;
    async function fetchProvinces() {
      try {
        const res = await fetch("/api/geo/provinces");
        if (!res.ok) return;
        const data = (await res.json()) as AdminArea[];
        if (!cancelled && Array.isArray(data)) {
          setProvinces(data);
        }
      } catch {
        // กรณีออฟไลน์ ข้ามการโหลดรายชื่อจังหวัด
      }
    }
    void fetchProvinces();
    return () => {
      cancelled = true;
    };
  }, []);

  // โหลดรายชื่ออำเภอเมื่อเลือกหรือเติมจังหวัด
  useEffect(() => {
    let cancelled = false;
    const code = draft.provinceCode;
    if (!code) return;

    async function fetchDistricts() {
      try {
        const res = await fetch(`/api/geo/provinces/${code}/districts`);
        if (!res.ok) return;
        const data = (await res.json()) as AdminArea[];
        if (!cancelled && Array.isArray(data)) {
          setDistricts(data);
        }
      } catch {
        // กรณีออฟไลน์ ข้ามการโหลดรายชื่ออำเภอ
      }
    }
    void fetchDistricts();
    return () => {
      cancelled = true;
    };
  }, [draft.provinceCode]);

  // โหลดรายชื่อตำบลเมื่อเลือกหรือเติมอำเภอ
  useEffect(() => {
    let cancelled = false;
    const code = draft.districtCode;
    if (!code) return;

    async function fetchSubdistricts() {
      try {
        const res = await fetch(`/api/geo/districts/${code}/subdistricts`);
        if (!res.ok) return;
        const data = (await res.json()) as AdminArea[];
        if (!cancelled && Array.isArray(data)) {
          setSubdistricts(data);
        }
      } catch {
        // กรณีออฟไลน์ ข้ามการโหลดรายชื่อตำบล
      }
    }
    void fetchSubdistricts();
    return () => {
      cancelled = true;
    };
  }, [draft.districtCode]);

  // ดึงจังหวัด/อำเภอ/ตำบลอัตโนมัติจากพิกัดผ่าน API ของ TF-05
  const reverseGeocodeCoordinates = useCallback(
    async (lat: number, lng: number) => {
      try {
        const res = await fetch(
          `/api/geo/reverse?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`,
        );
        if (!res.ok) return;
        const area = (await res.json()) as LocatedArea;
        if (area && area.province && area.district && area.subdistrict) {
          onAutoFillArea(area);
        }
      } catch {
        // กรณีออฟไลน์หรือเชื่อมต่อไม่ได้ ผู้ใช้ยังเลือกเองหรือข้ามได้ตามกติกา step2Schema
      }
    },
    [onAutoFillArea],
  );

  // TF-67: หยุดหา GPS เมื่อออกจากขั้นนี้ (component ถูกถอด) กันแบตหมด
  useEffect(() => () => stopGpsRef.current?.(), []);

  function stopRefiningGps() {
    stopGpsRef.current?.();
    stopGpsRef.current = null;
    setIsLocating(false);
    setRefineBest(null);
  }

  // ปุ่มดึงพิกัด GPS อัตโนมัติ (TF-67: รอให้แม่นขึ้นก่อนตัดสิน ดู gps-refine.ts)
  function handleRequestGps() {
    setGpsError(null);

    if (
      typeof navigator === "undefined" ||
      !navigator.geolocation ||
      typeof navigator.geolocation.watchPosition !== "function"
    ) {
      setGpsError("UNSUPPORTED");
      return;
    }

    stopRefiningGps();
    setIsLocating(true);
    stopGpsRef.current = startGpsRefine({
      geolocation: navigator.geolocation,
      onProgress: setRefineBest,
      onDone: (fix) => {
        stopGpsRef.current = null;
        setIsLocating(false);
        setRefineBest(null);
        onGpsPosition(fix);
        // พิกัดคลาดเคลื่อนหลายกิโลเมตรอาจเติมตำบลผิด ให้ผู้แจ้งเลือกเอง (TF-65)
        if (!isInaccurateGps(fix.accuracy)) {
          void reverseGeocodeCoordinates(fix.latitude, fix.longitude);
        }
      },
      onError: (error) => {
        stopGpsRef.current = null;
        setIsLocating(false);
        setRefineBest(null);
        setGpsError(error);
      },
    });
  }

  // เมื่อผู้ใช้แตะหรือลากหมุดบนแผนที่เอง
  function handleMapPinChange(coords: { lat: number; lng: number }) {
    stopRefiningGps();
    setGpsError(null);
    onManualPin(coords);
    void reverseGeocodeCoordinates(coords.lat, coords.lng);
  }

  // เมื่อผู้ใช้พิมพ์หรือวางลิงก์ Google Maps (เชื่อมกับการ์ด TF-10)
  async function handleResolveGoogleMapsLink(rawUrl: string) {
    setGmapsError(null);
    const trimmed = rawUrl.trim();
    if (!trimmed) return;

    const direct = parseGoogleMapsUrl(trimmed);
    if (direct.ok) {
      stopRefiningGps();
      setGpsError(null);
      onManualPin({ lat: direct.lat, lng: direct.lng }, LocationSource.GMAPS_LINK);
      void reverseGeocodeCoordinates(direct.lat, direct.lng);
      return;
    }

    if (direct.code !== "SHORT_LINK_NEEDS_RESOLVE") {
      setGmapsError(direct.error);
      return;
    }

    setIsResolvingGmaps(true);
    try {
      const res = await fetch("/api/geo/gmaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = (await res.json()) as {
        lat?: number;
        lng?: number;
        error?: string;
      };
      if (!res.ok || typeof data.lat !== "number" || typeof data.lng !== "number") {
        setGmapsError((locale === "th" ? data.error : undefined) ?? t.step3.gmapsConvertFailed);
        return;
      }
      stopRefiningGps();
      setGpsError(null);
      onManualPin({ lat: data.lat, lng: data.lng }, LocationSource.GMAPS_LINK);
      void reverseGeocodeCoordinates(data.lat, data.lng);
    } catch {
      setGmapsError(t.step3.gmapsShortLinkFailed);
    } finally {
      setIsResolvingGmaps(false);
    }
  }

  function handleSelectProvince(event: React.ChangeEvent<HTMLSelectElement>) {
    const code = event.target.value;
    const found = provinces.find((item) => String(item.code) === code);
    onUpdateField({
      provinceCode: code || undefined,
      province: found?.nameTh ?? undefined,
      districtCode: undefined,
      district: undefined,
      subdistrictCode: undefined,
      subdistrict: undefined,
    });
  }

  function handleSelectDistrict(event: React.ChangeEvent<HTMLSelectElement>) {
    const code = event.target.value;
    const found = districts.find((item) => String(item.code) === code);
    onUpdateField({
      districtCode: code || undefined,
      district: found?.nameTh ?? undefined,
      subdistrictCode: undefined,
      subdistrict: undefined,
    });
  }

  function handleSelectSubdistrict(event: React.ChangeEvent<HTMLSelectElement>) {
    const code = event.target.value;
    const found = subdistricts.find((item) => String(item.code) === code);
    onUpdateField({
      subdistrictCode: code || undefined,
      subdistrict: found?.nameTh ?? undefined,
    });
    if (code) void focusMapOnSubdistrict(code);
  }

  // TF-65: เลือกตำบลเองแล้วเลื่อนแผนที่ไปที่ตำบลนั้น ผู้แจ้งยังต้องแตะปักจุดเอง
  async function focusMapOnSubdistrict(code: string) {
    try {
      const res = await fetch(`/api/geo/subdistricts/${encodeURIComponent(code)}/bounds`);
      if (!res.ok) return;
      setFocusBounds((await res.json()) as AreaBounds);
    } catch {
      // ออฟไลน์: แผนที่อยู่ที่เดิม ผู้แจ้งยังเลื่อนและแตะเองได้
    }
  }

  const statusBanner = getGpsStatusMessage(
    {
      lat: draft.lat,
      lng: draft.lng,
      accuracyM: draft.accuracyM,
      gpsError,
    },
    t.sos,
  );

  const hasCoordinates = typeof draft.lat === "number" && typeof draft.lng === "number";
  // TF-65: GPS ไม่แม่น = มีพิกัดแต่ไม่ถือเป็นหมุด แสดงแค่วงความคลาดเคลื่อน
  const inaccurateGps = hasCoordinates && isInaccurateGps(draft.accuracyM);
  const addressRequired = inaccurateGps && draft.addressFallback === true;
  const mapPin = hasCoordinates && !inaccurateGps ? { lat: draft.lat!, lng: draft.lng! } : undefined;
  const accuracyCircle =
    hasCoordinates && typeof draft.accuracyM === "number" && draft.accuracyM > 0
      ? { lat: draft.lat!, lng: draft.lng!, radiusM: draft.accuracyM }
      : undefined;

  // รวมรายการในตัวเลือกกับค่าที่ได้จาก reverse geocode เพื่อให้แสดงชื่อทันทีแม้รายชื่อเต็มยังโหลดไม่เสร็จ
  const provinceOptions =
    draft.provinceCode &&
    draft.province &&
    !provinces.some((p) => String(p.code) === draft.provinceCode)
      ? [
          { code: Number(draft.provinceCode), nameTh: draft.province, nameEn: "" },
          ...provinces,
        ]
      : provinces;

  const activeDistricts = draft.provinceCode ? districts : [];
  const activeSubdistricts = draft.districtCode ? subdistricts : [];

  const districtOptions =
    draft.districtCode &&
    draft.district &&
    !activeDistricts.some((d) => String(d.code) === draft.districtCode)
      ? [
          { code: Number(draft.districtCode), nameTh: draft.district, nameEn: "" },
          ...activeDistricts,
        ]
      : activeDistricts;

  const subdistrictOptions =
    draft.subdistrictCode &&
    draft.subdistrict &&
    !activeSubdistricts.some((s) => String(s.code) === draft.subdistrictCode)
      ? [
          {
            code: Number(draft.subdistrictCode),
            nameTh: draft.subdistrict,
            nameEn: "",
          },
          ...activeSubdistricts,
        ]
      : activeSubdistricts;

  return (
    <>
      {/* ส่วนที่ 1: คุณอยู่ที่ไหน? (ปุ่ม GPS + แถบสถานะความแม่นยำ + แผนที่ MapLibre + ลิงก์ Google Maps) */}
      <section aria-labelledby="location-heading" className="flex flex-col gap-6 lg:gap-4">
        <div className="order-0 flex flex-col gap-2 lg:gap-4">
          <h2
            id="location-heading"
            className="font-heading text-text-primary text-[30px] leading-[1.25] font-bold tracking-[-0.3px] lg:text-[22px] lg:leading-[1.3] lg:font-semibold lg:tracking-[-0.11px]"
          >
            {t.step3.heading}
          </h2>
          <p className="text-text-secondary text-lg leading-[1.65]">
            <span className="lg:hidden">{t.step3.hintMobile}</span>
            <span className="hidden lg:inline">
              {t.step3.hintDesktop}
            </span>
          </p>
          {errors.location && (
            <p role="alert" className="text-base font-medium text-red-600">
              {errors.location}
            </p>
          )}
        </div>

        {/* ปุ่มดึงพิกัด GPS: จอคอมอยู่เหนือแผนที่ (B2), มือถืออยู่ใต้แผนที่และแถบสถานะ (MB2) */}
        <button
          type="button"
          data-testid="gps-locate-button"
          onClick={handleRequestGps}
          disabled={isLocating}
          className="bg-primary-50 text-primary-700 hover:bg-primary-100 lg:bg-primary-600 lg:text-text-on-primary lg:hover:bg-primary-700 order-3 flex min-h-12 w-full items-center justify-center rounded-full px-8 py-[18px] text-left transition-colors disabled:opacity-70 lg:order-1 lg:justify-start lg:gap-5 lg:rounded-[14px] lg:px-7 lg:py-6"
        >
          {/* โฉมมือถือ (Figma MB2) */}
          <span className="font-heading text-[19px] leading-[1.2] font-semibold lg:hidden">
            {isLocating
              ? t.step3.locating
              : hasCoordinates
                ? t.step3.locateAgain
                : t.step3.locate}
          </span>

          {/* โฉมจอคอม (Figma B2) */}
          <span className="bg-primary-700 hidden size-14 shrink-0 items-center justify-center rounded-full lg:flex">
            <img
              src="/brand/icon-locate-white.svg"
              alt=""
              width={28}
              height={28}
              className="size-7 shrink-0"
            />
          </span>
          <span className="hidden min-w-0 flex-1 flex-col gap-0.5 lg:flex">
            <span className="font-heading text-[22px] leading-[1.3] font-semibold tracking-[-0.11px]">
              {isLocating ? t.step3.locating : t.step3.locate}
            </span>
            <span className="text-lg leading-[1.65]">
              {t.step3.permissionHint}
            </span>
          </span>
          <img
            src="/brand/icon-chevron-right-white.svg"
            alt=""
            width={28}
            height={28}
            className="hidden size-7 shrink-0 lg:block"
          />
        </button>

        {/* TF-67: ระหว่างรอ GPS แม่นขึ้น ตัวเลขลดลงสดๆ และปักเองได้ตลอดไม่ต้องรอ */}
        {isLocating && (
          <div
            role="status"
            data-testid="gps-refine-status"
            className="border-primary-600/30 bg-primary-50 text-primary-700 order-2 flex w-full flex-col gap-3 rounded-[12px] border px-4 py-[14px] sm:flex-row sm:items-center sm:justify-between lg:order-2 lg:px-5"
          >
            <p className="text-lg leading-[1.55] font-semibold">
              {refineBest
                ? format(t.step3.refining, {
                    meters: Math.round(refineBest.accuracy).toLocaleString(
                      locale === "en" ? "en-US" : "th-TH",
                    ),
                  })
                : t.step3.searching}
            </p>
            <button
              type="button"
              onClick={stopRefiningGps}
              className="border-primary-600 bg-bg-surface text-primary-700 font-heading min-h-12 shrink-0 rounded-full border px-5 text-base font-semibold"
            >
              {t.step3.pinManually}
            </button>
          </div>
        )}

        {/* แถบสถานะพิกัด / แจ้งเตือนความแม่นยำเกิน 100 ม. / แจ้งเมื่อไม่อนุญาต GPS */}
        {!isLocating && statusBanner && (
          <div
            role="status"
            data-testid="gps-status-banner"
            data-tone={statusBanner.tone}
            className={`order-2 flex w-full items-center gap-3 rounded-[12px] px-4 py-[14px] lg:order-2 lg:px-5 ${
              statusBanner.tone === "success"
                ? "bg-green-50 text-green-700"
                : statusBanner.tone === "error"
                  ? "border border-red-600/30 bg-red-50 text-red-600"
                  : "border border-amber-500/40 bg-amber-50 text-amber-700"
            }`}
          >
            {statusBanner.tone === "success" && (
              <img
                src="/brand/icon-check-green.svg"
                alt=""
                width={18}
                height={18}
                className="size-[18px] shrink-0"
              />
            )}
            <p className="text-lg leading-[1.55] font-semibold">
              <span className="lg:hidden">{statusBanner.mobileText}</span>
              <span className="hidden lg:inline">{statusBanner.desktopText}</span>
            </p>
          </div>
        )}

        {/* TF-67: iPhone ที่ปิด "ตำแหน่งที่แม่นยำ" จะได้พิกัดหยาบเป็นกิโลเมตรเสมอ */}
        {!isLocating && ios && statusBanner?.tone === "error" && (
          <p
            data-testid="ios-precise-location-hint"
            className="text-text-primary order-2 rounded-[12px] bg-amber-50 px-4 py-3 text-base leading-[1.55] lg:order-2"
          >
            {t.step3.iosPreciseHint}
          </p>
        )}

        {/* แผนที่ MapLibre โหลดเฉพาะเมื่อเปิดขั้นที่ 3 */}
        <div className="order-1 w-full lg:order-3">
          {online ? (
            <LazyStep3LocationMap
              pin={mapPin}
              accuracyCircle={accuracyCircle}
              focusBounds={focusBounds}
              onPinChange={handleMapPinChange}
            />
          ) : (
            <p className="text-text-secondary rounded-[14px] border p-4">
              {t.step3.mapNeedsInternet}
            </p>
          )}
        </div>

        {/* TF-65: ทางออกเมื่อปักหมุดไม่ได้ — ห้ามบล็อก SOS ทั้งหมด */}
        {inaccurateGps && (
          <div className="order-3 flex flex-col gap-2 lg:order-4">
            {addressRequired ? (
              <p
                data-testid="address-fallback-notice"
                className="text-text-primary rounded-[12px] border border-amber-500/40 bg-amber-50 px-4 py-3 text-base leading-[1.55] font-medium"
              >
                {t.step3.addressFallbackNotice}
              </p>
            ) : (
              <button
                type="button"
                onClick={() => onUpdateField({ addressFallback: true })}
                className="border-border-strong bg-bg-surface text-text-primary hover:bg-bg-subtle font-heading min-h-12 w-full rounded-full border px-5 py-3 text-base font-semibold"
              >
                {t.step3.addressFallbackButton}
              </button>
            )}
          </div>
        )}

        {/* ช่องวางลิงก์ Google Maps (Figma B2: หรือวางลิงก์ Google Maps (ถ้ามี)) */}
        <div className="order-4 flex flex-col gap-2.5">
          <label
            htmlFor="sos-gmaps-url"
            className="text-text-primary text-base leading-[1.4] font-medium"
          >
            {t.step3.gmapsLabel}
          </label>
          <div className="border-border-default bg-bg-page focus-within:border-primary-600 focus-within:bg-bg-surface flex min-h-[60px] w-full items-center gap-3 rounded-[12px] border px-5 py-4 transition-shadow focus-within:shadow-[0px_0px_0px_5px_rgba(31,112,209,0.18)]">
            <img
              src="/brand/icon-link.svg"
              alt=""
              width={22}
              height={22}
              className="size-[22px] shrink-0"
            />
            <input
              id="sos-gmaps-url"
              type="url"
              value={draft.gmapsUrl ?? ""}
              onChange={(event) => {
                const nextUrl = event.target.value;
                onUpdateField({ gmapsUrl: nextUrl });
                if (gmapsError) setGmapsError(null);
              }}
              onBlur={(event) => {
                if (event.target.value.trim()) {
                  void handleResolveGoogleMapsLink(event.target.value);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleResolveGoogleMapsLink(draft.gmapsUrl ?? "");
                }
              }}
              placeholder="https://maps.app.goo.gl/…"
              disabled={isResolvingGmaps}
              className="text-text-primary placeholder:text-text-secondary min-w-0 flex-1 bg-transparent text-lg leading-[1.65] outline-none"
            />
          </div>
          {gmapsError ? (
            <p role="alert" className="text-base font-medium text-red-600">
              {gmapsError}
            </p>
          ) : (
            <p className="text-text-secondary text-base leading-[1.55]">
              {t.step3.gmapsHint}
            </p>
          )}
        </div>
      </section>

      {/* ส่วนที่ 2: ที่อยู่และจุดสังเกต (กรอกอัตโนมัติจากพิกัด + ช่องจุดสังเกตบังคับ) */}
      <section aria-labelledby="address-heading" className="flex flex-col gap-6 lg:gap-4">
        <div className="hidden flex-col gap-4 lg:flex">
          <h2
            id="address-heading"
            className="font-heading text-text-primary text-[22px] leading-[1.3] font-semibold tracking-[-0.11px]"
          >
            {t.step3.addressHeading}
          </h2>
          <p className="text-text-secondary text-lg leading-[1.65]">
            {t.step3.addressHint}
          </p>
        </div>

        {/* แถวที่ 1: จังหวัด + อำเภอ */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-2.5">
            <label
              htmlFor="sos-province"
              className="text-text-primary text-base leading-[1.4] font-medium"
            >
              {t.step3.province}
            </label>
            <div className="border-border-default bg-bg-page focus-within:border-primary-600 focus-within:bg-bg-surface relative flex min-h-[60px] w-full items-center rounded-[12px] border">
              <select
                id="sos-province"
                value={draft.provinceCode ?? ""}
                onChange={handleSelectProvince}
                className="text-text-primary min-h-[60px] w-full appearance-none bg-transparent py-4 pr-12 pl-5 text-lg leading-[1.65] outline-none"
              >
                <option value="">{t.step3.provinceSelect}</option>
                {provinceOptions.map((item) => (
                  <option key={item.code} value={String(item.code)}>
                    {locale === "en" && item.nameEn ? item.nameEn : item.nameTh}
                  </option>
                ))}
              </select>
              <img
                src="/brand/icon-chevron-right.svg"
                alt=""
                width={22}
                height={22}
                className="pointer-events-none absolute right-4 size-[22px] rotate-90"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <label
              htmlFor="sos-district"
              className="text-text-primary text-base leading-[1.4] font-medium"
            >
              {t.step3.district}
            </label>
            <div className="border-border-default bg-bg-page focus-within:border-primary-600 focus-within:bg-bg-surface relative flex min-h-[60px] w-full items-center rounded-[12px] border">
              <select
                id="sos-district"
                value={draft.districtCode ?? ""}
                onChange={handleSelectDistrict}
                disabled={!draft.provinceCode && districtOptions.length === 0}
                className="text-text-primary min-h-[60px] w-full appearance-none bg-transparent py-4 pr-12 pl-5 text-lg leading-[1.65] outline-none disabled:opacity-60"
              >
                <option value="">{t.step3.districtSelect}</option>
                {districtOptions.map((item) => (
                  <option key={item.code} value={String(item.code)}>
                    {locale === "en" && item.nameEn ? item.nameEn : item.nameTh}
                  </option>
                ))}
              </select>
              <img
                src="/brand/icon-chevron-right.svg"
                alt=""
                width={22}
                height={22}
                className="pointer-events-none absolute right-4 size-[22px] rotate-90"
              />
            </div>
          </div>
        </div>

        {/* แถวที่ 2: ตำบล / แขวง + บ้านเลขที่ / หมู่ / ซอย */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-2.5">
            <label
              htmlFor="sos-subdistrict"
              className="text-text-primary text-base leading-[1.4] font-medium"
            >
              {t.step3.subdistrict}
            </label>
            <div className="border-border-default bg-bg-page focus-within:border-primary-600 focus-within:bg-bg-surface relative flex min-h-[60px] w-full items-center rounded-[12px] border">
              <select
                id="sos-subdistrict"
                value={draft.subdistrictCode ?? ""}
                onChange={handleSelectSubdistrict}
                disabled={!draft.districtCode && subdistrictOptions.length === 0}
                className="text-text-primary min-h-[60px] w-full appearance-none bg-transparent py-4 pr-12 pl-5 text-lg leading-[1.65] outline-none disabled:opacity-60"
              >
                <option value="">{t.step3.subdistrictSelect}</option>
                {subdistrictOptions.map((item) => (
                  <option key={item.code} value={String(item.code)}>
                    {locale === "en" && item.nameEn ? item.nameEn : item.nameTh}
                  </option>
                ))}
              </select>
              <img
                src="/brand/icon-chevron-right.svg"
                alt=""
                width={22}
                height={22}
                className="pointer-events-none absolute right-4 size-[22px] rotate-90"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <label
              htmlFor="sos-address-line"
              className="text-text-primary text-base leading-[1.4] font-medium"
            >
              {t.step3.addressLine}
              {addressRequired && <span className="text-red-600"> *</span>}
            </label>
            <div
              className={`focus-within:border-primary-600 focus-within:bg-bg-surface flex min-h-[60px] w-full items-center gap-3 rounded-[12px] border px-5 py-4 transition-shadow focus-within:shadow-[0px_0px_0px_5px_rgba(31,112,209,0.18)] ${
                errors.addressLine ? "border-2 border-red-600 bg-red-50/40" : "border-border-default bg-bg-page"
              }`}
            >
              <img
                src="/brand/icon-home.svg"
                alt=""
                width={22}
                height={22}
                className="size-[22px] shrink-0"
              />
              <input
                id="sos-address-line"
                type="text"
                value={draft.addressLine ?? ""}
                onChange={(event) => onUpdateField({ addressLine: event.target.value })}
                placeholder={t.step3.addressLinePlaceholder}
                aria-required={addressRequired}
                aria-invalid={Boolean(errors.addressLine)}
                className="text-text-primary placeholder:text-text-secondary min-w-0 flex-1 bg-transparent text-lg leading-[1.65] outline-none"
              />
            </div>
            {errors.addressLine && (
              <p role="alert" className="text-base font-medium text-red-600">
                {errors.addressLine}
              </p>
            )}
          </div>
        </div>

        {/* ช่องจุดสังเกต (บังคับ) */}
        <div className="flex flex-col gap-2.5">
          <label
            htmlFor="sos-landmark"
            className="text-text-primary text-base leading-[1.4] font-medium"
          >
            <span className="lg:hidden">{t.step3.landmarkMobile}</span>
            <span className="hidden lg:inline">
              {t.step3.landmarkDesktop}
            </span>
          </label>
          <div
            className={`flex min-h-[120px] w-full items-start gap-3 rounded-[12px] px-5 py-4 transition-shadow lg:min-h-[60px] lg:items-center ${
              errors.landmark
                ? "border-2 border-red-600 bg-red-50/40"
                : "border-primary-600 bg-bg-surface border-2 shadow-[0px_0px_0px_5px_rgba(31,112,209,0.18)]"
            }`}
          >
            <img
              src="/brand/icon-map-pin-blue.svg"
              alt=""
              width={22}
              height={22}
              className="mt-1 size-[22px] shrink-0 lg:mt-0"
            />
            <textarea
              id="sos-landmark"
              rows={2}
              value={draft.landmark}
              onChange={(event) => onUpdateField({ landmark: event.target.value })}
              placeholder={t.step3.landmarkPlaceholder}
              className="text-text-primary placeholder:text-text-secondary min-w-0 flex-1 resize-none bg-transparent text-lg leading-[1.65] outline-none"
            />
          </div>
          {errors.landmark ? (
            <p role="alert" className="text-base font-medium text-red-600">
              {errors.landmark}
            </p>
          ) : (
            <p className="text-text-secondary text-base leading-[1.55]">
              {t.step3.landmarkHint}
            </p>
          )}
        </div>
      </section>

      {errors.missingSummary && errors.missingSummary.length > 0 && (
        <div
          role="alert"
          data-testid="step3-missing-alert"
          className="rounded-[12px] border border-red-600/30 bg-red-50 p-4 text-base text-red-600"
        >
          <p className="font-heading font-bold">{t.step3.cannotContinue}</p>
          <ul className="mt-1 list-disc pl-5 font-medium">
            {errors.missingSummary.map((item) => (
              <li key={item}>{format(t.step3.pleaseProvide, { item })}</li>
            ))}
          </ul>
        </div>
      )}

      <SosStepActions
        onPrev={onPrev}
        onNext={onNext}
        mobileLabel={t.common.next}
        desktopLabel={t.step3.nextDesktop}
      />
    </>
  );
}
