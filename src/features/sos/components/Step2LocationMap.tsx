"use client";

/* eslint-disable @next/next/no-img-element -- ไอคอนหมุด SVG จาก Figma */
import { useEffect, useRef, useState } from "react";
import type {
  Map as MapLibreMap,
  MapMouseEvent,
  Marker as MapLibreMarker,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { DEFAULT_THAILAND_CENTER } from "../draft-storage";

export interface Step2LocationMapProps {
  lat?: number;
  lng?: number;
  onPinChange: (coords: { lat: number; lng: number }) => void;
}

/**
 * สไตล์แผนที่ OpenStreetMap สำหรับ MapLibre (ไม่ต้องใช้ API key)
 */
export const OSM_RASTER_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: "raster" as const,
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [
    {
      id: "osm-tiles",
      type: "raster" as const,
      source: "osm",
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

/**
 * แผนที่ปักหมุดจุดเกิดเหตุด้วย MapLibre GL + OpenStreetMap (TF-09)
 * - โหลดเฉพาะตอนเปิดขั้นที่ 2 (ผ่าน next/dynamic ssr: false)
 * - เมื่อกดดึง GPS หมุดจะเลื่อนไปยังตำแหน่งปัจจุบันทันที
 * - ผู้ใช้สามารถแตะบนแผนที่หรือลากหมุดเพื่อปักหมุดเองได้แม้ไม่อนุญาต GPS
 */
export default function Step2LocationMap({
  lat,
  lng,
  onPinChange,
}: Step2LocationMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<MapLibreMarker | null>(null);
  const onPinChangeRef = useRef(onPinChange);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    onPinChangeRef.current = onPinChange;
  }, [onPinChange]);

  const activeLat = typeof lat === "number" ? lat : DEFAULT_THAILAND_CENTER.lat;
  const activeLng = typeof lng === "number" ? lng : DEFAULT_THAILAND_CENTER.lng;
  const hasExplicitPin = typeof lat === "number" && typeof lng === "number";

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    async function initMap() {
      try {
        const maplibregl = await import("maplibre-gl");
        if (cancelled || !containerRef.current) return;

        const initialLat =
          typeof lat === "number" ? lat : DEFAULT_THAILAND_CENTER.lat;
        const initialLng =
          typeof lng === "number" ? lng : DEFAULT_THAILAND_CENTER.lng;

        const map = new maplibregl.Map({
          container: containerRef.current,
          style: OSM_RASTER_STYLE,
          center: [initialLng, initialLat],
          zoom: typeof lat === "number" && typeof lng === "number" ? 16 : 12,
          attributionControl: false,
        });

        map.addControl(
          new maplibregl.NavigationControl({ showCompass: false }),
          "top-right",
        );

        const pinElement = document.createElement("div");
        pinElement.className =
          "pointer-events-auto flex items-center justify-center cursor-grab active:cursor-grabbing";
        pinElement.innerHTML = `
          <div class="flex size-10 items-center justify-center rounded-full border-[3px] border-bg-surface bg-red-600 shadow-md lg:hidden">
            <img src="/brand/icon-alert-white.svg" alt="" width="20" height="20" class="size-5" />
          </div>
          <div class="relative hidden size-[90px] items-center justify-center rounded-full bg-primary-500/20 lg:flex">
            <img src="/brand/icon-map-pin-red.svg" alt="" width="52" height="52" class="size-[52px]" />
          </div>
        `;

        const marker = new maplibregl.Marker({
          element: pinElement,
          draggable: true,
        })
          .setLngLat([initialLng, initialLat])
          .addTo(map);

        marker.on("dragend", () => {
          const pos = marker.getLngLat();
          onPinChangeRef.current({ lat: pos.lat, lng: pos.lng });
        });

        map.on("click", (event: MapMouseEvent) => {
          marker.setLngLat(event.lngLat);
          onPinChangeRef.current({
            lat: event.lngLat.lat,
            lng: event.lngLat.lng,
          });
        });

        mapRef.current = map;
        markerRef.current = marker;
        setMapReady(true);
      } catch {
        // กรณีเบราว์เซอร์ไม่รองรับ WebGL หรืออยู่ในโหมดออฟไลน์ ให้ใช้โหมดแตะปักหมุดสำรองด้านล่าง
        setMapReady(false);
      }
    }

    void initMap();

    return () => {
      cancelled = true;
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // โหลดแผนที่ครั้งแรกเมื่อเปิดขั้นที่ 2 เท่านั้น ส่วนการเปลี่ยนพิกัดใช้อีก useEffect ด้านล่าง
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // เมื่อพิกัดเปลี่ยน (เช่น กดปุ่มดึง GPS หรือวางลิงก์ Google Maps) ให้ย้ายหมุดและเลื่อนแผนที่ตามทันที
  useEffect(() => {
    if (typeof lat !== "number" || typeof lng !== "number") return;

    if (markerRef.current) {
      markerRef.current.setLngLat([lng, lat]);
    }
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [lng, lat],
        zoom: Math.max(mapRef.current.getZoom(), 16),
        essential: true,
      });
    }
  }, [lat, lng]);

  function handleFallbackMapClick(event: React.MouseEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      onPinChange({ lat: activeLat, lng: activeLng });
      return;
    }
    const offsetX = (event.clientX - rect.left) / rect.width - 0.5;
    const offsetY = 0.5 - (event.clientY - rect.top) / rect.height;
    const nextLat = Number((activeLat + offsetY * 0.01).toFixed(6));
    const nextLng = Number((activeLng + offsetX * 0.01).toFixed(6));
    onPinChange({ lat: nextLat, lng: nextLng });
  }

  return (
    <div
      data-testid="step2-map-container"
      data-pin-lat={hasExplicitPin ? lat : undefined}
      data-pin-lng={hasExplicitPin ? lng : undefined}
      className="border-border-default bg-primary-50 lg:bg-bg-subtle relative h-[200px] w-full overflow-hidden rounded-[14px] border lg:h-[300px]"
    >
      {/* พื้นที่แสดงแผนที่ MapLibre GL */}
      <div ref={containerRef} className="size-full" />

      {/* โหมดสำรองเมื่อกำลังโหลดแผนที่หรือไม่มี WebGL: แสดงลายเส้นถนนและหมุดตาม Figma พร้อมให้แตะปักหมุดได้ทันที */}
      {!mapReady && (
        <button
          type="button"
          onClick={handleFallbackMapClick}
          aria-label="แตะบนแผนที่เพื่อปักหมุดตำแหน่งของคุณ"
          className="absolute inset-0 flex size-full cursor-crosshair items-center justify-center overflow-hidden text-left"
        >
          {/* ลายเส้นถนนจำลองตาม Figma เมื่อแผนที่จริงยังไม่พร้อม */}
          <span
            aria-hidden="true"
            className="bg-bg-surface/80 pointer-events-none absolute top-[28%] -left-6 h-3 w-[120%] rotate-[12deg]"
          />
          <span
            aria-hidden="true"
            className="bg-bg-surface/80 pointer-events-none absolute top-[58%] -left-6 h-4 w-[120%] -rotate-[14deg]"
          />
          <span
            aria-hidden="true"
            className="bg-bg-surface/80 pointer-events-none absolute -top-6 left-[32%] h-[130%] w-3 rotate-[8deg]"
          />

          {/* หมุดมือถือ (Figma MB2: วงกลมแดง 40px มีไอคอนเตือนสีขาวตรงกลาง) */}
          <span className="border-bg-surface relative z-10 flex size-10 items-center justify-center rounded-full border-[3px] bg-red-600 shadow-[0px_3px_4px_rgba(10,26,51,0.25)] lg:hidden">
            <img
              src="/brand/icon-alert-white.svg"
              alt=""
              width={20}
              height={20}
              className="size-5 shrink-0"
            />
          </span>

          {/* หมุดจอคอม (Figma B2: วงรัศมีสีฟ้าอ่อน 90px + หมุดสีแดง 52px) */}
          <span className="bg-primary-500/20 relative z-10 hidden size-[90px] items-center justify-center rounded-full lg:flex">
            <img
              src="/brand/icon-map-pin-red.svg"
              alt=""
              width={52}
              height={52}
              className="size-[52px] shrink-0"
            />
          </span>
        </button>
      )}

      {/* ป้ายพิกัดมุมล่างซ้ายช่วยให้ตรวจสอบได้ว่าหมุดอยู่ที่พิกัดใด */}
      {hasExplicitPin && (
        <div
          data-testid="step2-pin-coordinates"
          className="border-border-default bg-bg-surface/95 text-text-secondary pointer-events-none absolute bottom-2.5 left-2.5 z-10 rounded-full border px-3 py-1 font-mono text-xs font-medium shadow-xs"
        >
          {lat.toFixed(5)}, {lng.toFixed(5)}
        </div>
      )}
    </div>
  );
}
