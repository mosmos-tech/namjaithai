"use client";

import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { OSM_RASTER_STYLE } from "../../../lib/map/osm-style";
import { useI18n } from "../../../lib/i18n/I18nProvider";

type Point = { lat: number; lng: number };

const LINE_SOURCE = "track-route";

function lineFeature(a: Point, b: Point | null): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  return {
    type: "FeatureCollection",
    features: b
      ? [
          {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: [
                [a.lng, a.lat],
                [b.lng, b.lat],
              ],
            },
          },
        ]
      : [],
  };
}

/**
 * แผนที่ติดตามเคสของผู้แจ้ง (TF-42): หมุดผู้แจ้ง หมุดทีม และเส้นประระหว่างกัน
 * MapLibre + OSM ตัวเดียวกับแผนที่อื่นในโปรเจกต์ โหลดเฉพาะฝั่งเบราว์เซอร์ (next/dynamic ssr: false)
 * แผนที่เป็นของเสริม — โหลดไม่ขึ้นหรือ tile ล่ม แผงล่างยังบอกสถานะ ทีม เวลาที่คาดว่าจะถึง และปุ่มโทรครบ
 */
export default function TrackMap({ scene, team }: { scene: Point; team: Point | null }) {
  const { t } = useI18n();
  const pinLabels = useRef({ reporter: t.track.reporterPin, team: t.track.teamPin });
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const teamMarkerRef = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tilesFailed, setTilesFailed] = useState(false);
  const fittedRef = useRef(false);
  const { lat: sceneLat, lng: sceneLng } = scene;

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const maplibregl = await import("maplibre-gl");
        if (cancelled || !containerRef.current) return;
        maplibregl.setWorkerUrl(
          new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href,
        );
        const map = new maplibregl.Map({
          container: containerRef.current,
          style: OSM_RASTER_STYLE,
          center: [sceneLng, sceneLat],
          zoom: 14,
          attributionControl: { compact: true },
        });
        const reporter = document.createElement("div");
        reporter.dataset.testid = "track-reporter-pin";
        reporter.innerHTML = `<img src="/brand/icon-map-pin-red.svg" alt="${pinLabels.current.reporter}" width="44" height="44" />`;
        new maplibregl.Marker({ element: reporter, anchor: "bottom" })
          .setLngLat([sceneLng, sceneLat])
          .addTo(map);

        const teamElement = document.createElement("div");
        teamElement.dataset.testid = "track-team-pin";
        teamElement.innerHTML = `<div class="flex size-10 items-center justify-center rounded-full border-[3px] border-white bg-primary-600 shadow-md"><img src="/brand/icon-navigation.svg" alt="${pinLabels.current.team}" width="20" height="20" class="size-5 invert" /></div>`;
        teamMarkerRef.current = new maplibregl.Marker({ element: teamElement });

        map.on("error", () => setTilesFailed(true));
        map.on("load", () => {
          if (cancelled) return;
          map.addSource(LINE_SOURCE, {
            type: "geojson",
            data: lineFeature({ lat: sceneLat, lng: sceneLng }, null),
          });
          map.addLayer({
            id: "track-route-line",
            type: "line",
            source: LINE_SOURCE,
            paint: { "line-color": "#1F6FD1", "line-width": 3, "line-dasharray": [2, 2] },
          });
          setReady(true);
        });
        mapRef.current = map;
      } catch {
        // ไม่รองรับ WebGL / โหลดสคริปต์ไม่ได้ — แผงล่างยังใช้ได้ครบ
        if (!cancelled) setFailed(true);
      }
    }
    void init();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [sceneLat, sceneLng]);

  // ตำแหน่งทีมเปลี่ยนทุกรอบ polling: ย้ายหมุดและเส้น ไม่มีตำแหน่ง = ซ่อนหมุด (ไม่ค้างตำแหน่งเก่า)
  useEffect(() => {
    const map = mapRef.current;
    const marker = teamMarkerRef.current;
    if (!ready || !map || !marker) return;
    (map.getSource(LINE_SOURCE) as GeoJSONSource | undefined)?.setData(lineFeature(scene, team));
    if (!team) {
      marker.remove();
      return;
    }
    marker.setLngLat([team.lng, team.lat]).addTo(map);
    if (!fittedRef.current) {
      fittedRef.current = true;
      map.fitBounds(
        [
          [Math.min(scene.lng, team.lng), Math.min(scene.lat, team.lat)],
          [Math.max(scene.lng, team.lng), Math.max(scene.lat, team.lat)],
        ],
        { padding: 60, maxZoom: 16, duration: 0 },
      );
    }
  }, [ready, scene, team]);

  if (failed) {
    return (
      <p
        className="bg-bg-subtle text-text-secondary rounded-[14px] p-4 text-base"
        data-testid="track-map-failed"
      >
        {t.track.mapFailed}
      </p>
    );
  }
  return (
    <div className="relative">
      <div
        ref={containerRef}
        data-testid="track-map"
        data-ready={ready}
        aria-label={t.track.mapLabel}
        role="img"
        className="bg-bg-subtle h-64 w-full overflow-hidden rounded-[14px] sm:h-80"
      />
      {tilesFailed && (
        <p className="text-text-secondary bg-bg-surface/90 absolute right-2 bottom-2 left-2 rounded-[8px] px-3 py-1 text-sm">
          {t.track.mapTilesFailed}
        </p>
      )}
    </div>
  );
}
