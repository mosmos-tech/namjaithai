import {
  INCIDENT_REGISTRY,
  INCIDENT_TYPE_ORDER,
  incidentTypesIn,
  thaiFullPeriodLabel,
  type DailyHelpedBar,
  type IncidentType,
  type UnitPeriodBar,
} from "@/lib/domain";

// ข้อมูลของ HelpedChart เป็นค่าล้วน (ไม่มีฟังก์ชัน) ส่งจาก Server Component เข้า Client Component ได้

export type ChartSeries = { key: string; label: string; color: string };
export type ChartBar = {
  key: string;
  label: string; // ป้ายในตาราง เช่น "21 ต.ค. 69"
  fullLabel: string; // ป้ายในแถบตัวเลขตอนแตะแท่ง ปี พ.ศ. เต็ม เช่น "21 ต.ค. 2569"
  axisLabel: string;
  axisOnNarrow: boolean;
  axisOnWide: boolean;
  values: number[]; // ตามลำดับ series (ซ้อนจากล่างขึ้นบน)
};
export type ChartData = {
  series: ChartSeries[];
  bars: ChartBar[];
  legendLabel: string;
  totalLabel: string; // คำหน้าผลรวมของแท่งในแถบตัวเลข
  table: { periodHeader: string; columns: string[]; rows: number[][] };
};

// ชุด 8 สีที่ตรวจ CVD แล้ว (dataviz) — ประเภทเหตุผูกสีตามลำดับทะเบียน ไม่ใช่ลำดับที่โผล่ในกราฟ
const SERIES_COLORS = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#008300",
  "#6250d6",
  "#e34948",
];
const colorOf = (type: IncidentType) => SERIES_COLORS[INCIDENT_TYPE_ORDER.indexOf(type) % 8];

/** TF-57 /unit/dashboard: ช่วยสำเร็จ (ผู้แจ้งยืนยัน) แยกสีตามประเภทเหตุ */
export function incidentChartData(bars: UnitPeriodBar[], period: "month" | "day"): ChartData {
  const types = incidentTypesIn(bars);
  return {
    series: types.map((type) => ({
      key: type,
      label: INCIDENT_REGISTRY[type].label.th,
      color: colorOf(type),
    })),
    bars: bars.map((bar) => ({
      key: bar.key,
      label: bar.label,
      fullLabel: thaiFullPeriodLabel(bar.key),
      axisLabel: bar.axisLabel,
      axisOnNarrow: bar.axisOnNarrow,
      axisOnWide: bar.axisOnWide,
      values: types.map((type) => bar.helpedByType[type] ?? 0),
    })),
    legendLabel: "ประเภทเหตุในกราฟ",
    totalLabel: "ช่วยสำเร็จ",
    table: {
      periodHeader: period === "month" ? "เดือน" : "วันที่",
      columns: [
        "ช่วยสำเร็จ",
        ...types.map((type) => INCIDENT_REGISTRY[type].label.th),
        "ปิดโดยหัวหน้า",
        "ส่งต่อ",
        "ปล่อยเคส",
        "คนที่ช่วยได้",
      ],
      rows: bars.map((bar) => [
        bar.helped,
        ...types.map((type) => bar.helpedByType[type] ?? 0),
        bar.leadClosed,
        bar.referred,
        bar.released,
        bar.peopleHelped,
      ]),
    },
  };
}

/** TF-61 /units/[id]: 30 วันล่าสุด แยกสี ผู้แจ้งยืนยัน / หัวหน้าปิด (ตรวจสีด้วย validator ของ dataviz แล้ว) */
export function dailyHelpedChartData(bars: DailyHelpedBar[]): ChartData {
  return {
    series: [
      { key: "helped", label: "ผู้แจ้งยืนยัน", color: SERIES_COLORS[0] },
      { key: "lead-closed", label: "หัวหน้าปิด", color: SERIES_COLORS[1] },
    ],
    bars: bars.map((bar) => ({
      key: bar.key,
      label: bar.label,
      fullLabel: thaiFullPeriodLabel(bar.key),
      axisLabel: bar.axisLabel,
      axisOnNarrow: bar.axisOnNarrow,
      axisOnWide: bar.axisOnWide,
      values: [bar.helped, bar.leadClosed],
    })),
    legendLabel: "คำอธิบายสี",
    totalLabel: "รวม",
    table: {
      periodHeader: "วันที่",
      columns: ["ผู้แจ้งยืนยัน", "หัวหน้าปิด"],
      rows: bars.map((bar) => [bar.helped, bar.leadClosed]),
    },
  };
}
