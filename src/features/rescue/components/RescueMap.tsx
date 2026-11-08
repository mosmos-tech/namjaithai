"use client";

import Link from "next/link";
import {
  Building2,
  Car,
  CircleHelp,
  Flame,
  HeartPulse,
  LifeBuoy,
  PawPrint,
  Waves,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap, Point as MapPoint } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  CaseStatus,
  INCIDENT_REGISTRY,
  RESCUE_RADIUS_OPTIONS_M,
  RescueCaseSort,
  Urgency,
  formatDistance,
  formatWaitDuration,
  isLongWait,
  locationAccuracyWarning,
  openCaseStatusLabel,
  type IncidentType,
  type RescueRadiusM,
  type UnitCapability,
  type UserRole,
} from "@/lib/domain";
import { createClient } from "@/lib/supabase/client";
import { CapabilityFilter } from "@/features/cases/components/CapabilityFilter";
import { TriageTag } from "@/features/cases/components/TriageTag";
import { useCapabilityFilter } from "@/features/cases/use-capability-filter";
import { DEFAULT_THAILAND_CENTER } from "@/features/sos/draft-storage";
import { RescueLiveStatus } from "./RescueLiveStatus";
import { useRescueCasesLive } from "../use-rescue-cases-live";
import { fetchAllRescueCases, type RescueCase, type RescueCaseQuery } from "../rescue-cases";

type LocationState =
  { kind: "locating" } | { kind: "ready"; lat: number; lng: number } | { kind: "unavailable" };

type ScreenPin = {
  case: RescueCase;
  pos: MapPoint;
};

type ScreenCluster = {
  id: number;
  count: number;
  coords: [number, number];
  pos: MapPoint;
};

const OSM_RASTER_STYLE = {
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

const EMPTY_GEOJSON: GeoJSON.FeatureCollection<GeoJSON.Point> = {
  type: "FeatureCollection",
  features: [],
};

const URGENCY_COLORS: Record<Urgency, { hex: string; bgClass: string; label: string }> = {
  RED: { hex: "#C62828", bgClass: "bg-[#C62828]", label: "วิกฤต" },
  YELLOW: { hex: "#F2A516", bgClass: "bg-[#F2A516]", label: "เร่งด่วน" },
  GREEN: { hex: "#1B7A3A", bgClass: "bg-[#1B7A3A]", label: "ทั่วไป" },
};

export function RescueMap({
  capabilities,
  userRole,
}: {
  capabilities: UnitCapability[];
  userRole: UserRole;
}) {
  const [location, setLocation] = useState<LocationState>(() =>
    typeof window !== "undefined" && !("geolocation" in navigator)
      ? { kind: "unavailable" }
      : { kind: "locating" },
  );
  const [radiusM, setRadiusM] = useState<RescueRadiusM | null>(null);
  const [urgencyFilter, setUrgencyFilter] = useState<Urgency | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<CaseStatus | "ALL">("ALL");
  const [incidentTypeFilter, setIncidentTypeFilter] = useState<IncidentType | "ALL">("ALL");

  const [cases, setCases] = useState<RescueCase[]>([]);
  const [selectedCase, setSelectedCase] = useState<RescueCase | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const casesRef = useRef<RescueCase[]>([]);
  const geojsonRef = useRef<GeoJSON.FeatureCollection<GeoJSON.Point>>(EMPTY_GEOJSON);
  const locationRef = useRef<LocationState>(location);
  const centeredReadyLocationRef = useRef(false);
  const pendingPinSyncRef = useRef(false);
  const queryRef = useRef<RescueCaseQuery | null>(null);
  const requestSeqRef = useRef(0);
  const activeForegroundLoadsRef = useRef(0);
  const [sourceLoaded, setSourceLoaded] = useState(false);

  const [screenPins, setScreenPins] = useState<ScreenPin[]>([]);
  const [screenClusters, setScreenClusters] = useState<ScreenCluster[]>([]);

  const now = useNow();

  // ขอพิกัดกู้ภัย
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (position) =>
        setLocation({
          kind: "ready",
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }),
      () => setLocation({ kind: "unavailable" }),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);

  const hasLocation = location.kind === "ready";

  const query = useMemo<RescueCaseQuery | null>(() => {
    if (location.kind === "locating") return null;
    return {
      sort: RescueCaseSort.PRIORITY,
      radiusM: hasLocation ? radiusM : null,
      location: location.kind === "ready" ? { lat: location.lat, lng: location.lng } : null,
    };
  }, [location, hasLocation, radiusM]);

  const loadCases = useCallback(
    async (q: RescueCaseQuery, options?: { silent?: boolean }): Promise<boolean> => {
      const seq = ++requestSeqRef.current;
      const foreground = !options?.silent;
      if (foreground) {
        activeForegroundLoadsRef.current += 1;
        setLoading(true);
        setError(null);
      }
      try {
        const result = await fetchAllRescueCases(createClient(), q);
        if (seq !== requestSeqRef.current) return false;
        setCases(result.cases);
        setSelectedCase((prev) =>
          prev ? (result.cases.find((c) => c.id === prev.id) ?? null) : null,
        );
        setError(null);
        return true;
      } catch (err) {
        if (seq === requestSeqRef.current && foreground) {
          setError(
            err instanceof Error ? err.message : "โหลดข้อมูลเคสกู้ภัยไม่สำเร็จ กรุณาลองใหม่",
          );
        }
        return false;
      } finally {
        if (foreground) {
          activeForegroundLoadsRef.current = Math.max(0, activeForegroundLoadsRef.current - 1);
          if (activeForegroundLoadsRef.current === 0) {
            setLoading(false);
          }
        }
      }
    },
    [],
  );

  useEffect(() => {
    queryRef.current = query;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- โหลดใหม่เมื่อเงื่อนไข query เปลี่ยน
    if (query) void loadCases(query);
  }, [query, loadCases]);

  const refreshCases = useCallback(async () => {
    const currentQuery = queryRef.current;
    if (!currentQuery) return false;
    return loadCases(currentQuery, { silent: true });
  }, [loadCases]);

  const live = useRescueCasesLive({
    role: userRole,
    enabled: query !== null,
    onRefresh: refreshCases,
  });
  const { notifyManualSync } = live;

  const handleManualRefresh = useCallback(async () => {
    if (!query) return;
    const ok = await loadCases(query);
    if (ok) notifyManualSync();
  }, [loadCases, notifyManualSync, query]);

  // ตัวกรองความสามารถหน่วย (TF-52)
  const filterAvailable = capabilities.length > 0;
  const filter = useCapabilityFilter(cases, capabilities);
  const baseCases = filterAvailable ? filter.cases : cases;

  // กรองเคสตามความเร่งด่วน / สถานะ / ประเภทเหตุ
  const visibleCases = useMemo(() => {
    return baseCases.filter((c) => {
      if (urgencyFilter !== "ALL" && c.urgency !== urgencyFilter) return false;
      if (statusFilter !== "ALL" && c.status !== statusFilter) return false;
      if (incidentTypeFilter !== "ALL" && c.incident_type !== incidentTypeFilter) return false;
      return true;
    });
  }, [baseCases, urgencyFilter, statusFilter, incidentTypeFilter]);

  const visibleCaseMap = useMemo(() => new Map(visibleCases.map((c) => [c.id, c])), [visibleCases]);

  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  // นับจำนวนเคสแต่ละความเร่งด่วน
  const urgencyCounts = useMemo(() => {
    const counts = { RED: 0, YELLOW: 0, GREEN: 0 };
    for (const c of baseCases) {
      if (c.urgency in counts) counts[c.urgency]++;
    }
    return counts;
  }, [baseCases]);

  // แปลงเคสเป็น GeoJSON FeatureCollection
  const geojson = useMemo(() => {
    return {
      type: "FeatureCollection" as const,
      features: visibleCases.map((c) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [c.lng, c.lat],
        },
        properties: {
          id: c.id,
          caseCode: c.caseCode,
          urgency: c.urgency,
          status: c.status,
          incident_type: c.incident_type,
        },
      })),
    };
  }, [visibleCases]);

  useEffect(() => {
    casesRef.current = visibleCases;
    geojsonRef.current = geojson;
  }, [visibleCases, geojson]);

  // ซิงค์ตำแหน่งหมุดและกลุ่มบนหน้าจอ โดยไม่อ้างอิงสถานะการโหลดของไทล์พื้นหลัง OSM
  const syncScreenElements = useCallback((options?: { markRendered?: boolean }) => {
    const map = mapRef.current;
    if (
      !map ||
      !map.getSource("cases-source") ||
      !map.getLayer("unclustered-point") ||
      !map.getLayer("clusters")
    ) {
      return;
    }
    if (!map.isSourceLoaded("cases-source")) {
      pendingPinSyncRef.current = true;
      return;
    }

    try {
      const renderedPoints = map.queryRenderedFeatures({ layers: ["unclustered-point"] });
      const renderedClusters = map.queryRenderedFeatures({ layers: ["clusters"] });

      const pins: ScreenPin[] = [];
      const seenIds = new Set<string>();
      for (const feat of renderedPoints) {
        const id = feat.properties?.id;
        if (!id || seenIds.has(id)) continue;
        seenIds.add(id);
        const item = casesRef.current.find((c) => c.id === id);
        if (item) {
          const coords = (feat.geometry as GeoJSON.Point).coordinates as [number, number];
          pins.push({ case: item, pos: map.project(coords) });
        }
      }
      setScreenPins(pins);

      const clusters: ScreenCluster[] = [];
      const seenClusterIds = new Set<number>();
      for (const feat of renderedClusters) {
        const clusterId = feat.properties?.cluster_id;
        if (clusterId === undefined || seenClusterIds.has(clusterId)) continue;
        seenClusterIds.add(clusterId);
        const count = feat.properties?.point_count ?? 0;
        const coords = (feat.geometry as GeoJSON.Point).coordinates as [number, number];
        clusters.push({
          id: clusterId,
          count,
          coords,
          pos: map.project(coords),
        });
      }
      setScreenClusters(clusters);
      if (options?.markRendered) {
        pendingPinSyncRef.current = false;
      }
    } catch {
      // ignore querying errors during map transition
    }
  }, []);

  // เริ่มต้นแผนที่ MapLibre GL เพียงครั้งเดียวและตั้งค่า source/layers ทันทีที่ style.load (ไม่รอไทล์ OSM)
  useEffect(() => {
    let cancelled = false;
    let localMap: MapLibreMap | null = null;
    const container = containerRef.current;
    if (!container) return;

    async function initMap() {
      try {
        const maplibregl = await import("maplibre-gl");
        if (cancelled || !containerRef.current) return;

        maplibregl.setWorkerUrl(
          new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href,
        );

        const initialLocation = locationRef.current;
        if (initialLocation.kind === "ready") {
          centeredReadyLocationRef.current = true;
        }
        const initialLat =
          initialLocation.kind === "ready" ? initialLocation.lat : DEFAULT_THAILAND_CENTER.lat;
        const initialLng =
          initialLocation.kind === "ready" ? initialLocation.lng : DEFAULT_THAILAND_CENTER.lng;

        const map = new maplibregl.Map({
          container: containerRef.current,
          style: OSM_RASTER_STYLE,
          center: [initialLng, initialLat],
          zoom: initialLocation.kind === "ready" ? 11 : 6,
          attributionControl: false,
        });
        localMap = map;
        mapRef.current = map;

        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

        map.once("style.load", () => {
          if (cancelled) return;

          if (!map.getSource("cases-source")) {
            map.addSource("cases-source", {
              type: "geojson",
              data: geojsonRef.current,
              cluster: true,
              clusterMaxZoom: 14,
              clusterRadius: 50,
            });
          }

          // กลุ่มหมุดเมื่อซูมออก
          if (!map.getLayer("clusters")) {
            map.addLayer({
              id: "clusters",
              type: "circle",
              source: "cases-source",
              filter: ["has", "point_count"],
              paint: {
                "circle-color": [
                  "step",
                  ["get", "point_count"],
                  "#3B86E0",
                  5,
                  "#1F6FD1",
                  15,
                  "#1757A6",
                ],
                "circle-radius": ["step", ["get", "point_count"], 20, 5, 26, 15, 32],
                "circle-stroke-width": 3,
                "circle-stroke-color": "#ffffff",
              },
            });
          }

          // ตัวเลขจำนวนในกลุ่ม
          if (!map.getLayer("cluster-count")) {
            map.addLayer({
              id: "cluster-count",
              type: "symbol",
              source: "cases-source",
              filter: ["has", "point_count"],
              layout: {
                "text-field": "{point_count_abbreviated}",
                "text-size": 15,
              },
              paint: {
                "text-color": "#ffffff",
              },
            });
          }

          // หมุดเดี่ยว สีตามความเร่งด่วน: แดง (#C62828), เหลือง (#F2A516), เขียว (#1B7A3A)
          if (!map.getLayer("unclustered-point")) {
            map.addLayer({
              id: "unclustered-point",
              type: "circle",
              source: "cases-source",
              filter: ["!", ["has", "point_count"]],
              paint: {
                "circle-color": [
                  "match",
                  ["get", "urgency"],
                  "RED",
                  "#C62828",
                  "YELLOW",
                  "#F2A516",
                  "GREEN",
                  "#1B7A3A",
                  "#1F6FD1",
                ],
                "circle-radius": 14,
                "circle-stroke-width": 3,
                "circle-stroke-color": "#ffffff",
              },
            });
          }

          // คลิกที่กลุ่มเพื่อขยาย
          map.on("click", "clusters", async (e) => {
            const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
            const clusterId = features[0]?.properties?.cluster_id;
            if (clusterId === undefined) return;
            const source = map.getSource("cases-source") as GeoJSONSource;
            const zoom = await source.getClusterExpansionZoom(clusterId);
            const coords = (features[0].geometry as GeoJSON.Point).coordinates as [number, number];
            map.easeTo({ center: coords, zoom: Math.max(zoom, map.getZoom() + 2) });
          });

          // คลิกที่หมุดเพื่อเปิดแผ่นรายละเอียด
          map.on("click", "unclustered-point", (e) => {
            const features = map.queryRenderedFeatures(e.point, { layers: ["unclustered-point"] });
            const caseId = features[0]?.properties?.id;
            if (!caseId) return;
            const found = casesRef.current.find((c) => c.id === caseId);
            if (found) setSelectedCase(found);
          });

          map.on("mouseenter", "clusters", () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", "clusters", () => {
            map.getCanvas().style.cursor = "";
          });
          map.on("mouseenter", "unclustered-point", () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", "unclustered-point", () => {
            map.getCanvas().style.cursor = "";
          });

          pendingPinSyncRef.current = true;
          setSourceLoaded(true);
          syncScreenElements();
        });

        const onMapMove = () => {
          pendingPinSyncRef.current = true;
          syncScreenElements();
        };
        map.on("move", onMapMove);
        map.on("moveend", onMapMove);
        map.on("idle", () => syncScreenElements({ markRendered: true }));
        map.on("sourcedata", (e) => {
          if (e.sourceId === "cases-source") {
            pendingPinSyncRef.current = true;
            if (e.isSourceLoaded) {
              syncScreenElements();
            }
          }
        });
        map.on("render", () => {
          if (pendingPinSyncRef.current) {
            syncScreenElements({ markRendered: true });
          }
        });
      } catch {
        setError("ไม่สามารถโหลดแผนที่ได้");
      }
    }

    void initMap();

    return () => {
      cancelled = true;
      setSourceLoaded(false);
      centeredReadyLocationRef.current = false;
      if (localMap) {
        localMap.remove();
        localMap = null;
      }
      if (mapRef.current) {
        mapRef.current = null;
      }
    };
  }, [syncScreenElements]);

  // ย้ายจุดศูนย์กลางเมื่อได้รับพิกัดกู้ภัยครั้งแรกหลังจากสร้างแผนที่แล้ว
  useEffect(() => {
    if (location.kind === "ready" && mapRef.current && !centeredReadyLocationRef.current) {
      centeredReadyLocationRef.current = true;
      pendingPinSyncRef.current = true;
      mapRef.current.jumpTo({
        center: [location.lng, location.lat],
        zoom: 11,
      });
    }
  }, [location, sourceLoaded]);

  // อัปเดตข้อมูล GeoJSON เมื่อ visibleCases เปลี่ยน
  useEffect(() => {
    if (!mapRef.current || !sourceLoaded) return;
    const source = mapRef.current.getSource("cases-source") as GeoJSONSource | undefined;
    if (source) {
      pendingPinSyncRef.current = true;
      source.setData(geojson);
      const timer = setTimeout(() => syncScreenElements(), 50);
      return () => clearTimeout(timer);
    }
  }, [geojson, sourceLoaded, syncScreenElements]);

  return (
    <section aria-labelledby="rescue-map-heading" className="flex flex-col gap-4">
      <h2 id="rescue-map-heading" className="sr-only">
        แผนที่กู้ภัย
      </h2>

      {/* แถบเครื่องมือด้านบน: สลับไปหน้ารายการเคส + ตัวกรองต่างๆ */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/rescue/cases"
              className="border-border-strong bg-bg-surface text-text-primary hover:bg-bg-subtle inline-flex min-h-12 items-center rounded-full border px-5 text-base font-semibold transition-colors"
            >
              ดูรายการเคส
            </Link>
            {query && (
              <button
                type="button"
                disabled={loading}
                onClick={() => void handleManualRefresh()}
                className="border-border-strong bg-bg-surface text-text-primary hover:bg-bg-subtle inline-flex min-h-12 items-center rounded-full border px-4 text-base font-semibold disabled:opacity-50"
              >
                {loading ? "กำลังโหลด…" : "รีเฟรช"}
              </button>
            )}
            <RescueLiveStatus mode={live.mode} reason={live.reason} />
          </div>

          <p
            data-testid="rescue-map-counter"
            className="text-text-primary font-heading text-lg font-semibold"
          >
            แสดง {visibleCases.length} จาก {cases.length} เคส
          </p>
        </div>

        {/* ตัวกรองความเร่งด่วน (สีหมุด) */}
        <div role="group" aria-label="กรองความเร่งด่วน" className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={urgencyFilter === "ALL"}
            onClick={() => setUrgencyFilter("ALL")}
            className={`min-h-12 rounded-full border px-4 text-base font-semibold transition-colors ${
              urgencyFilter === "ALL"
                ? "border-primary-600 bg-primary-600 text-white"
                : "border-border-strong bg-bg-surface text-text-primary"
            }`}
          >
            ทั้งหมด ({baseCases.length})
          </button>
          {(["RED", "YELLOW", "GREEN"] as Urgency[]).map((u) => {
            const active = urgencyFilter === u;
            const meta = URGENCY_COLORS[u];
            return (
              <button
                key={u}
                type="button"
                aria-pressed={active}
                onClick={() => setUrgencyFilter(u)}
                className={`inline-flex min-h-12 items-center gap-2 rounded-full border px-4 text-base font-semibold transition-colors ${
                  active
                    ? "border-primary-600 bg-primary-600 text-white"
                    : "border-border-strong bg-bg-surface text-text-primary"
                }`}
              >
                <span
                  className={`size-3 rounded-full ${meta.bgClass} border border-white`}
                  aria-hidden="true"
                />
                {meta.label} ({urgencyCounts[u]})
              </button>
            );
          })}
        </div>

        {/* แถวตัวกรอง: สถานะ / รัศมี / ประเภทเหตุ */}
        <div className="flex flex-wrap items-center gap-3">
          {/* สถานะ */}
          <label className="flex min-h-12 items-center gap-2 text-base">
            <span className="text-text-primary font-semibold">สถานะ</span>
            <select
              aria-label="ตัวกรองสถานะ"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as CaseStatus | "ALL")}
              className="border-border-strong bg-bg-surface min-h-12 rounded-lg border px-3 text-base"
            >
              <option value="ALL">ทุกสถานะ</option>
              <option value="NEW">รอรับเคส</option>
              <option value="ACCEPTED">รับเคสแล้ว</option>
              <option value="EN_ROUTE">กำลังเดินทาง</option>
              <option value="ON_SITE">ถึงจุดเกิดเหตุ</option>
            </select>
          </label>

          {/* รัศมีจากตำแหน่งกู้ภัย */}
          {hasLocation ? (
            <label className="flex min-h-12 items-center gap-2 text-base">
              <span className="text-text-primary font-semibold">รัศมี</span>
              <select
                aria-label="ตัวกรองรัศมี"
                value={radiusM ?? ""}
                onChange={(e) =>
                  setRadiusM(e.target.value ? (Number(e.target.value) as RescueRadiusM) : null)
                }
                className="border-border-strong bg-bg-surface min-h-12 rounded-lg border px-3 text-base"
              >
                {RESCUE_RADIUS_OPTIONS_M.map((m) => (
                  <option key={m} value={m}>
                    {m / 1000} กม.
                  </option>
                ))}
                <option value="">ทั้งหมด</option>
              </select>
            </label>
          ) : (
            location.kind === "unavailable" && (
              <p
                data-testid="location-fallback"
                className="text-text-secondary rounded-[12px] bg-amber-50 px-3 py-2 text-sm"
              >
                ไม่ได้เปิดพิกัด แสดงเคสทั้งหมดในจังหวัด
              </p>
            )
          )}

          {/* ประเภทเหตุ */}
          <label className="flex min-h-12 items-center gap-2 text-base">
            <span className="text-text-primary font-semibold">ประเภทเหตุ</span>
            <select
              aria-label="ตัวกรองประเภทเหตุ"
              value={incidentTypeFilter}
              onChange={(e) => setIncidentTypeFilter(e.target.value as IncidentType | "ALL")}
              className="border-border-strong bg-bg-surface min-h-12 rounded-lg border px-3 text-base"
            >
              <option value="ALL">ทุกประเภทเหตุ</option>
              {Object.entries(INCIDENT_REGISTRY).map(([key, item]) => (
                <option key={key} value={key}>
                  {item.label.th}
                </option>
              ))}
            </select>
          </label>

          {/* ตัวกรองความสามารถหน่วย (TF-52) */}
          {filterAvailable && (
            <CapabilityFilter enabled={filter.enabled} onChange={filter.setEnabled} />
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-[12px] bg-red-50 px-4 py-3 text-base text-red-600">
          {error}
        </p>
      )}

      {/* แผนที่กู้ภัยเต็มจอ */}
      <div
        data-testid="rescue-map-container"
        data-active-pins={visibleCases.length}
        className="border-border-default bg-bg-subtle relative h-[560px] w-full overflow-hidden rounded-[20px] border sm:h-[640px] lg:h-[720px]"
      >
        <div ref={containerRef} className="size-full" />

        {/* เลเยอร์หมุดแบบโต้ตอบและทดสอบได้ (Interactive Screen Overlay) */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="false">
          {screenPins.map(({ case: staleCase, pos }) => {
            const c = visibleCaseMap.get(staleCase.id);
            if (!c) return null;
            return (
              <button
                key={c.id}
                type="button"
                data-testid={`map-pin-${c.caseCode}`}
                data-urgency={c.urgency}
                data-status={c.status}
                data-incident={c.incident_type}
                aria-label={`หมุดเคส ${c.caseCode} ${INCIDENT_REGISTRY[c.incident_type].label.th} ความเร่งด่วน ${c.urgency}`}
                onClick={() => setSelectedCase(c)}
                style={{
                  position: "absolute",
                  left: `${pos.x}px`,
                  top: `${pos.y}px`,
                  transform: "translate(-50%, -50%)",
                }}
                className={`pointer-events-auto flex size-10 items-center justify-center rounded-full border-3 border-white text-white shadow-md transition-transform hover:scale-110 active:scale-95 ${
                  URGENCY_COLORS[c.urgency]?.bgClass ?? "bg-primary-600"
                }`}
              >
                <PinIcon incidentType={c.incident_type} />
              </button>
            );
          })}

          {screenClusters.map((cl) => (
            <button
              key={cl.id}
              type="button"
              data-testid="map-cluster"
              data-cluster-count={cl.count}
              aria-label={`กลุ่มเคส ${cl.count} รายการ`}
              onClick={async () => {
                const map = mapRef.current;
                if (!map) return;
                const source = map.getSource("cases-source") as GeoJSONSource | undefined;
                if (!source) return;
                const zoom = await source.getClusterExpansionZoom(cl.id);
                map.easeTo({ center: cl.coords, zoom: Math.max(zoom, map.getZoom() + 2) });
              }}
              style={{
                position: "absolute",
                left: `${cl.pos.x}px`,
                top: `${cl.pos.y}px`,
                transform: "translate(-50%, -50%)",
              }}
              className="bg-primary-600 pointer-events-auto flex size-11 items-center justify-center rounded-full border-3 border-white text-base font-bold text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
            >
              {cl.count}
            </button>
          ))}
        </div>

        {/* แผ่นรายละเอียดเมื่อแตะหมุด (Figma 48:3142 Bottom sheet) */}
        {selectedCase && (
          <CaseDetailSheet item={selectedCase} now={now} onClose={() => setSelectedCase(null)} />
        )}
      </div>
    </section>
  );
}

const incidentIcons: Record<IncidentType, typeof Waves> = {
  FLOOD: Waves,
  FIRE: Flame,
  ROAD_ACCIDENT: Car,
  MEDICAL: HeartPulse,
  WATER_RESCUE: LifeBuoy,
  COLLAPSE: Building2,
  ANIMAL: PawPrint,
  OTHER: CircleHelp,
};

function PinIcon({ incidentType }: { incidentType: IncidentType }) {
  const Icon = incidentIcons[incidentType] ?? CircleHelp;
  return <Icon size={18} strokeWidth={2.2} aria-hidden="true" data-incident-icon={incidentType} />;
}

/**
 * แผ่นรายละเอียดเคสเมื่อแตะหมุด (TF-22)
 * - เคสที่ยังไม่มีคนรับ (NEW): แสดงเวลารอด้วย formatWaitDuration(now - createdAt)
 * - เคสที่รับแล้ว: แสดงสถานะรับแล้ว
 * - ไม่แสดงเบอร์โทร หรือข้อมูลส่วนบุคคลที่เป็นความลับ
 */
function CaseDetailSheet({
  item,
  now,
  onClose,
}: {
  item: RescueCase;
  now: number;
  onClose: () => void;
}) {
  const waitingMs = now - new Date(item.createdAt).getTime();
  const longWait = isLongWait(waitingMs);
  const accuracy = locationAccuracyWarning(item.locationSource, item.accuracyM);
  const peopleSummary = summarizePeople(item.people);

  return (
    <div
      data-testid="case-detail-sheet"
      className="border-border-default bg-bg-surface absolute inset-x-0 bottom-0 z-20 flex max-h-[85%] flex-col gap-3 overflow-y-auto rounded-t-[24px] border-t p-5 shadow-2xl sm:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-text-primary font-mono text-base font-semibold">
              {item.caseCode}
            </span>
            <span className="bg-bg-subtle text-text-secondary rounded-full px-3 py-0.5 text-xs font-semibold">
              {INCIDENT_REGISTRY[item.incident_type]?.label.th ?? item.incident_type}
            </span>
          </div>
          {item.distanceM !== null && (
            <p data-testid="case-distance" className="text-primary-700 text-sm font-semibold">
              ห่างประมาณ {formatDistance(item.distanceM)}
            </p>
          )}
        </div>

        <button
          type="button"
          aria-label="ปิดแผ่นรายละเอียด"
          onClick={onClose}
          className="text-text-secondary hover:bg-bg-subtle flex size-10 items-center justify-center rounded-full transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M5 5L15 15M15 5L5 15"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <TriageTag
        urgency={item.urgency}
        reasons={item.triageReasons}
        systemUrgency={item.systemUrgency}
        overrideReason={item.overrideReason}
      />

      {/* เกณฑ์ TF-22: เคสที่ยังไม่มีคนรับ แสดงว่ารอมาแล้วกี่ชั่วโมงกี่นาที */}
      {item.status === "NEW" ? (
        <div className="flex items-center gap-2">
          <span className="text-text-secondary text-sm">เวลารอ:</span>
          <span
            data-testid="wait-duration"
            className={`text-base font-semibold ${longWait ? "text-red-600" : "text-amber-700"}`}
          >
            {formatWaitDuration(waitingMs)}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-text-secondary text-sm">สถานะ:</span>
          <span className="text-text-primary text-base font-semibold">
            {openCaseStatusLabel[item.status] ?? item.status}
          </span>
        </div>
      )}

      {peopleSummary && (
        <p className="text-text-primary text-base">
          <span className="text-text-secondary font-medium">ผู้ประสบภัย: </span>
          {peopleSummary}
        </p>
      )}

      {item.landmark && (
        <p className="text-text-primary text-base">
          <span className="text-text-secondary font-medium">จุดสังเกต: </span>
          {item.landmark}
        </p>
      )}

      {item.area && <p className="text-text-secondary text-sm">{item.area}</p>}

      {accuracy && (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            accuracy.level === "danger" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"
          }`}
        >
          {accuracy.text}
        </p>
      )}

      <div className="mt-2 flex flex-wrap gap-3">
        <Link
          href="/rescue/cases"
          className="bg-primary-600 font-heading inline-flex min-h-12 flex-1 items-center justify-center rounded-full px-5 text-base font-semibold text-white transition-opacity hover:opacity-90"
        >
          ดูในรายการเคส
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="border-border-strong bg-bg-surface font-heading text-text-primary hover:bg-bg-subtle inline-flex min-h-12 items-center justify-center rounded-full border px-5 text-base font-semibold transition-colors"
        >
          ปิด
        </button>
      </div>
    </div>
  );
}

function summarizePeople(people: RescueCase["people"]): string {
  const parts: string[] = [];
  if (people.adults > 0) parts.push(`ผู้ใหญ่ ${people.adults} คน`);
  if (people.elderly > 0) parts.push(`ผู้สูงอายุ ${people.elderly} คน`);
  if (people.bedridden > 0) parts.push(`ผู้ป่วยติดเตียง ${people.bedridden} คน`);
  if (people.children > 0) parts.push(`เด็กเล็ก ${people.children} คน`);
  if (people.pets > 0) parts.push(`สัตว์เลี้ยง ${people.pets} ตัว`);
  return parts.join(" · ");
}

function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
