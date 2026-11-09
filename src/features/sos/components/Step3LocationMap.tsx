"use client";

/* eslint-disable @next/next/no-img-element -- ไอคอนหมุด SVG จาก Figma */
import { useEffect, useRef, useState } from "react";
import type {
  Map as MapLibreMap,
  MapMouseEvent,
  Marker as MapLibreMarker,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { AreaBounds } from "../../../lib/domain";
import { DEFAULT_THAILAND_CENTER } from "../draft-storage";
import { circleBounds, circlePolygon } from "../map-geometry";

export interface Step3LocationMapProps {
  // หมุดที่ปักแล้ว (GPS ที่แม่นพอ / ปักเอง / ลิงก์) — ไม่มี = ไม่แสดงหมุด
  pin?: { lat: number; lng: number };
  // วงความคลาดเคลื่อนของ GPS รัศมีเป็นเมตรจริง (TF-65)
  accuracyCircle?: { lat: number; lng: number; radiusM: number };
  // กรอบพื้นที่ที่ให้แผนที่เลื่อนไปดู เช่น ตำบลที่ผู้แจ้งเลือก (TF-65)
  focusBounds?: AreaBounds;
  onPinChange: (coords: { lat: number; lng: number }) => void;
}

const CIRCLE_SOURCE = "gps-accuracy";
// สีจาก globals.css (--color-primary-600) — paint ของ MapLibre ใช้ class Tailwind ไม่ได้
const CIRCLE_COLOR = "#1F6FD1";
const FIT_PADDING = 24;

type LngLatBoundsTuple = [[number, number], [number, number]];
const toLngLatBounds = (b: AreaBounds): LngLatBoundsTuple => [
  [b.west, b.south],
  [b.east, b.north],
];

function circleFeature(circle?: Step3LocationMapProps["accuracyCircle"]) {
  return {
    type: "FeatureCollection" as const,
    features: circle
      ? [
          {
            type: "Feature" as const,
            properties: {},
            geometry: {
              type: "Polygon" as const,
              coordinates: [circlePolygon(circle, circle.radiusM)],
            },
          },
        ]
      : [],
  };
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
 * - โหลดเฉพาะตอนเปิดขั้นที่ 3 (ผ่าน next/dynamic ssr: false)
 * - เมื่อกดดึง GPS หมุดจะเลื่อนไปยังตำแหน่งปัจจุบันทันที
 * - ผู้ใช้สามารถแตะบนแผนที่หรือลากหมุดเพื่อปักหมุดเองได้แม้ไม่อนุญาต GPS
 * - TF-65: วาดวงความคลาดเคลื่อนเป็นระยะจริงและซูมให้เห็นทั้งวง; ไม่มีหมุดที่ยืนยันแล้วจะไม่แสดงหมุด
 */
export default function Step3LocationMap({
  pin,
  accuracyCircle,
  focusBounds,
  onPinChange,
}: Step3LocationMapProps) {
  const lat = pin?.lat;
  const lng = pin?.lng;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<MapLibreMarker | null>(null);
  const onPinChangeRef = useRef(onPinChange);
  const [mapReady, setMapReady] = useState(false);
  // พร้อมเพิ่ม layer วงกลม (style โหลดเสร็จ) — แยกจาก mapReady ที่แค่สร้างแผนที่ได้
  const [styleLoaded, setStyleLoaded] = useState(false);

  useEffect(() => {
    onPinChangeRef.current = onPinChange;
  }, [onPinChange]);

  const activeLat = lat ?? accuracyCircle?.lat ?? DEFAULT_THAILAND_CENTER.lat;
  const activeLng = lng ?? accuracyCircle?.lng ?? DEFAULT_THAILAND_CENTER.lng;
  const hasExplicitPin = typeof lat === "number" && typeof lng === "number";

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    async function initMap() {
      try {
        const maplibregl = await import("maplibre-gl");
        if (cancelled || !containerRef.current) return;
        // MapLibre v6 หาไฟล์ worker ข้างตัวเอง แต่ Turbopack รวมโค้ดแล้วไฟล์นั้นไม่ตามไปด้วย ("Worker failed to load")
        // ไม่มี worker แผนที่ยังขึ้นแต่วาด GeoJSON (วงความคลาดเคลื่อน TF-65) ไม่ได้ จึงบอกตำแหน่งไฟล์ให้ตรงๆ
        maplibregl.setWorkerUrl(
          new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href,
        );

        const initialLat = lat ?? accuracyCircle?.lat ?? DEFAULT_THAILAND_CENTER.lat;
        const initialLng = lng ?? accuracyCircle?.lng ?? DEFAULT_THAILAND_CENTER.lng;

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
        // TF-65: เอาวงฟ้าขนาดตายตัว 90px รอบหมุดจอคอมออก (ดูเหมือนแม่นทั้งที่ไม่แม่น) ใช้วงระยะจริงแทน
        pinElement.innerHTML = `
          <div class="flex size-10 items-center justify-center rounded-full border-[3px] border-bg-surface bg-red-600 shadow-md lg:hidden">
            <img src="/brand/icon-alert-white.svg" alt="" width="20" height="20" class="size-5" />
          </div>
          <img src="/brand/icon-map-pin-red.svg" alt="" width="52" height="52" class="hidden size-[52px] lg:block" />
        `;
        if (!hasExplicitPin) pinElement.style.visibility = "hidden";

        const marker = new maplibregl.Marker({
          element: pinElement,
          draggable: true,
        })
          .setLngLat([initialLng, initialLat])
          .addTo(map);

        map.on("load", () => {
          if (cancelled) return;
          map.addSource(CIRCLE_SOURCE, { type: "geojson", data: circleFeature() });
          map.addLayer({
            id: "gps-accuracy-fill",
            type: "fill",
            source: CIRCLE_SOURCE,
            paint: { "fill-color": CIRCLE_COLOR, "fill-opacity": 0.12 },
          });
          map.addLayer({
            id: "gps-accuracy-line",
            type: "line",
            source: CIRCLE_SOURCE,
            paint: { "line-color": CIRCLE_COLOR, "line-width": 2, "line-opacity": 0.7 },
          });
          setStyleLoaded(true);
        });

        marker.on("dragend", () => {
          const pos = marker.getLngLat();
          onPinChangeRef.current({ lat: pos.lat, lng: pos.lng });
        });

        map.on("click", (event: MapMouseEvent) => {
          marker.setLngLat(event.lngLat);
          marker.getElement().style.visibility = "visible";
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
    // โหลดแผนที่ครั้งแรกเมื่อเปิดขั้นที่ 3 เท่านั้น ส่วนการเปลี่ยนพิกัดใช้อีก useEffect ด้านล่าง
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // เมื่อพิกัดเปลี่ยน (เช่น กดปุ่มดึง GPS หรือวางลิงก์ Google Maps) ให้ย้ายหมุดและเลื่อนแผนที่ตามทันที
  // ถ้ามีวงความคลาดเคลื่อน ให้ effect ของวงเป็นคนซูม (ต้องเห็นทั้งวง ไม่ใช่ซูมเข้า 16 เสมอ)
  const circleKey = accuracyCircle
    ? `${accuracyCircle.lat},${accuracyCircle.lng},${accuracyCircle.radiusM}`
    : "";
  useEffect(() => {
    const marker = markerRef.current;
    if (typeof lat !== "number" || typeof lng !== "number") {
      if (marker) marker.getElement().style.visibility = "hidden";
      return;
    }

    if (marker) {
      marker.setLngLat([lng, lat]);
      marker.getElement().style.visibility = "visible";
    }
    if (mapRef.current && !circleKey) {
      mapRef.current.flyTo({
        center: [lng, lat],
        zoom: Math.max(mapRef.current.getZoom(), 16),
        essential: true,
      });
    }
  }, [lat, lng, circleKey]);

  // TF-65: วาดวงความคลาดเคลื่อนรัศมีเท่าค่าจริง และซูมให้เห็นทั้งวง
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded) return;
    const source = map.getSource(CIRCLE_SOURCE);
    if (source && "setData" in source) {
      (source as { setData: (data: unknown) => void }).setData(circleFeature(accuracyCircle));
    }
    if (accuracyCircle) {
      map.fitBounds(toLngLatBounds(circleBounds(accuracyCircle, accuracyCircle.radiusM)), {
        padding: FIT_PADDING,
        maxZoom: 17,
      });
    }
    // circleKey แทน object เพื่อไม่ให้ซูมซ้ำทุกครั้งที่ component render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circleKey, styleLoaded]);

  // TF-65: เลือกตำบลเองแล้วเลื่อนแผนที่ไปที่ตำบลนั้น ให้แตะปักจุดได้ง่าย
  const boundsKey = focusBounds
    ? `${focusBounds.west},${focusBounds.south},${focusBounds.east},${focusBounds.north}`
    : "";
  useEffect(() => {
    if (!mapRef.current || !focusBounds || !mapReady) return;
    mapRef.current.fitBounds(toLngLatBounds(focusBounds), { padding: FIT_PADDING, maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsKey, mapReady]);

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
      data-testid="step3-map-container"
      data-pin-lat={hasExplicitPin ? lat : undefined}
      data-pin-lng={hasExplicitPin ? lng : undefined}
      data-accuracy-radius-m={accuracyCircle?.radiusM}
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

          {/* แสดงหมุดเมื่อปักแล้วเท่านั้น (TF-65) */}
          {hasExplicitPin && (
            <>
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

              {/* หมุดจอคอม (Figma B2: หมุดสีแดง 52px — ไม่ใส่วงฟ้า 90px ตายตัว เพราะดูเหมือนแม่นทั้งที่ไม่แม่น) */}
              <img
                src="/brand/icon-map-pin-red.svg"
                alt=""
                width={52}
                height={52}
                className="relative z-10 hidden size-[52px] shrink-0 lg:block"
              />
            </>
          )}
        </button>
      )}

      {/* ป้ายพิกัดมุมล่างซ้ายช่วยให้ตรวจสอบได้ว่าหมุดอยู่ที่พิกัดใด */}
      {hasExplicitPin && (
        <div
          data-testid="step3-pin-coordinates"
          className="border-border-default bg-bg-surface/95 text-text-secondary pointer-events-none absolute bottom-2.5 left-2.5 z-10 rounded-full border px-3 py-1 font-mono text-xs font-medium shadow-xs"
        >
          {lat.toFixed(5)}, {lng.toFixed(5)}
        </div>
      )}
    </div>
  );
}
