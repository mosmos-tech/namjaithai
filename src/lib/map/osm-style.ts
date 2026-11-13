/**
 * สไตล์แผนที่ OpenStreetMap สำหรับ MapLibre (ไม่ต้องใช้ API key)
 * ใช้ร่วมกันทุกแผนที่ในโปรเจกต์: ปักหมุด SOS (TF-09), แผนที่กู้ภัย (TF-27), ติดตามเคสของผู้แจ้ง (TF-42)
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
