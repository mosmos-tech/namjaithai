import { useEffect, useRef, type RefObject } from "react";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import { teamPinAgeLabel, teamPinState } from "@/lib/domain";

/** แถวจาก list_team_locations() (TF-28) — ไม่มีเบอร์โทร ไม่มีเคส */
export type TeamLocation = {
  user_id: string;
  display_name: string;
  unit_name: string | null;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  recorded_at: string;
};

/**
 * หมุดทีมกู้ภัยบนแผนที่ (TF-28) — Marker แยกจากหมุดเคส (ไม่รวมกลุ่ม ไม่ปนสีความเร่งด่วน)
 * รูปสี่เหลี่ยมมุมมนสีม่วงมีไอคอนคน + ชื่อ · ไม่อัปเดตเกิน 2 นาทีสีจาง · เกิน 15 นาทีไม่แสดง
 */
export function useTeamMarkers(
  mapRef: RefObject<MapLibreMap | null>,
  ready: boolean,
  team: TeamLocation[],
  /** นาฬิกาที่เดินเป็นช่วง — แค่ให้วาดใหม่ตามเวลา (สีจาง/ซ่อน) ส่วนการคำนวณใช้เวลาจริงตอนวาด */
  tick: number,
) {
  const markersRef = useRef(new Map<string, Marker>());

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || tick < 0) return;
    let cancelled = false;
    void import("maplibre-gl").then((maplibregl) => {
      if (cancelled) return;
      const now = Date.now();
      const markers = markersRef.current;
      const shown = new Set<string>();
      for (const member of team) {
        const state = teamPinState(member.recorded_at, now);
        if (state === "hidden") continue;
        shown.add(member.user_id);
        let marker = markers.get(member.user_id);
        if (!marker) {
          marker = new maplibregl.Marker({ element: createTeamPinElement(), anchor: "bottom" })
            .setLngLat([member.lng, member.lat])
            .addTo(map);
          markers.set(member.user_id, marker);
        }
        marker.setLngLat([member.lng, member.lat]);
        updateTeamPinElement(marker.getElement(), member, state, now);
      }
      for (const [id, marker] of markers) {
        if (shown.has(id)) continue;
        marker.remove();
        markers.delete(id);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [mapRef, ready, team, tick]);

  useEffect(() => {
    const markers = markersRef.current;
    return () => {
      for (const marker of markers.values()) marker.remove();
      markers.clear();
    };
  }, []);
}

const PERSON_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
  '<circle cx="12" cy="7" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8z"/></svg>';

function createTeamPinElement(): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("role", "img");
  el.className = "flex flex-col items-center gap-0.5 transition-opacity";
  el.innerHTML =
    `<span class="flex size-9 items-center justify-center rounded-[10px] border-2 border-white bg-violet-700 text-white shadow-md">${PERSON_ICON}</span>` +
    '<span data-team-name class="max-w-36 truncate rounded-full bg-white/95 px-2 text-xs font-semibold text-violet-900 shadow"></span>';
  return el;
}

function updateTeamPinElement(
  el: HTMLElement,
  member: TeamLocation,
  state: "fresh" | "stale",
  now: number,
) {
  const age = teamPinAgeLabel(member.recorded_at, now);
  el.dataset.testid = `team-pin-${member.user_id}`;
  el.setAttribute("data-testid", `team-pin-${member.user_id}`);
  el.dataset.state = state;
  el.style.opacity = state === "stale" ? "0.45" : "1";
  el.setAttribute(
    "aria-label",
    `ทีมกู้ภัย ${member.display_name}${member.unit_name ? ` (${member.unit_name})` : ""} ${age}`,
  );
  el.title = `${member.display_name} · ${age}`;
  const name = el.querySelector<HTMLElement>("[data-team-name]");
  if (name) name.textContent = member.display_name;
}
