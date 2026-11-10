import {
  INCIDENT_REGISTRY,
  INCIDENT_TYPE_ORDER,
  incidentTypesIn,
  type IncidentType,
  type UnitPeriodBar,
} from "@/lib/domain";

// สีผูกกับประเภทเหตุตามลำดับทะเบียน (ไม่ใช่ลำดับที่โผล่ในกราฟ) — ชุด 8 สีที่ตรวจ CVD แล้ว (dataviz)
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

// พื้นที่วาดแท่งอย่างเดียว (สัดส่วน 3:1) — ตัวหนังสือแกนอยู่นอก SVG เป็น HTML 12px
// เพราะตัวหนังสือใน SVG ย่อตามความกว้าง จอ 375px จะเหลือไม่ถึง 7px
const WIDTH = 600;
const HEIGHT = 200;
const PAD_TOP = 4;
const GAP = 2; // ช่องว่างสีพื้นระหว่างชั้นของแท่ง

/**
 * กราฟแท่งซ้อน: จำนวนเคสช่วยสำเร็จ (ผู้แจ้งยืนยัน) แยกสีตามประเภทเหตุ (TF-57)
 * - ช่วง 12 เดือนล่าสุด = เดือนละแท่ง · เลือกเดือน = วันละแท่ง (วันที่ 1 ถึงวันสุดท้าย)
 * - SVG ล้วน ไม่ใช้ไลบรารี ย่อขยายตามความกว้าง ใช้ได้ที่ 375px
 *   ตัวหนังสือแกน 12px เสมอ จอแคบแสดงเฉพาะป้ายที่ axisOnNarrow (เว้นเดือน / ทุก 5 วัน)
 * - ชี้ที่แท่งเห็นตัวเลข (title) · มีตารางตัวเลขชุดเดียวกันให้โปรแกรมอ่านหน้าจอและคนที่แยกสีไม่ออก
 */
export function HelpedChart({
  bars: months,
  title,
  period,
}: {
  bars: UnitPeriodBar[];
  title: string;
  period: "month" | "day";
}) {
  const types = incidentTypesIn(months);
  const max = Math.max(1, ...months.map((m) => m.helped));
  const ticks = niceTicks(max);
  const top = ticks.at(-1)!;
  const plotHeight = HEIGHT - PAD_TOP;
  const slot = WIDTH / months.length;
  const barWidth = Math.min(28, slot * 0.6);
  const y = (value: number) => PAD_TOP + plotHeight - (value / top) * plotHeight;

  return (
    <section aria-labelledby="helped-chart-heading" className="flex flex-col gap-3">
      <h2 id="helped-chart-heading" className="font-heading text-xl font-semibold">
        {title}
      </h2>

      {types.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="ประเภทเหตุในกราฟ">
          {types.map((type) => (
            <li key={type} className="text-text-secondary flex items-center gap-2 text-sm">
              <span
                aria-hidden="true"
                className="inline-block size-3 rounded-sm"
                style={{ backgroundColor: colorOf(type) }}
              />
              {INCIDENT_REGISTRY[type].label.th}
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        {/* แกน Y: ตัวเลขอยู่ตรงเส้นตาราง (ตำแหน่งเป็น % ของความสูงพื้นที่วาด) */}
        <div aria-hidden="true" className="relative w-8 shrink-0">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="text-text-secondary absolute right-0 -translate-y-1/2 font-mono text-xs"
              style={{ top: `${(y(tick) / HEIGHT) * 100}%` }}
            >
              {tick}
            </span>
          ))}
        </div>
        <div className="relative aspect-[3/1] min-w-0 flex-1">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="absolute inset-0 h-full w-full overflow-visible"
            role="img"
            aria-label={`กราฟแท่ง${title} รายละเอียดอยู่ในตารางด้านล่าง`}
            data-testid="helped-chart"
          >
            {ticks.map((tick) => (
              <line
                key={tick}
                x1={0}
                x2={WIDTH}
                y1={y(tick)}
                y2={y(tick)}
                stroke="currentColor"
                className="text-border-default"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {months.map((month, index) => {
              const cx = slot * index + slot / 2;
              let base = 0;
              return (
                <g key={month.key}>
                  {types.map((type) => {
                    const value = month.helpedByType[type] ?? 0;
                    if (value === 0) return null;
                    const y0 = y(base);
                    base += value;
                    const y1 = y(base);
                    const isTop = base === month.helped;
                    const height = Math.max(1, y0 - y1 - (isTop ? 0 : GAP));
                    return (
                      <path
                        key={type}
                        d={barPath(cx - barWidth / 2, y1, barWidth, height, isTop ? 4 : 0)}
                        fill={colorOf(type)}
                      >
                        <title>{`${month.label} · ${INCIDENT_REGISTRY[type].label.th} ${value} เคส`}</title>
                      </path>
                    );
                  })}
                  {/* พื้นที่ชี้ใหญ่กว่าแท่ง: แสดงยอดรวมของเดือน */}
                  <rect
                    x={slot * index}
                    y={PAD_TOP}
                    width={slot}
                    height={plotHeight}
                    fill="transparent"
                  >
                    <title>{`${month.label}: ช่วยสำเร็จ ${month.helped} เคส`}</title>
                  </rect>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      {/* แกน X: 12px เสมอ จอแคบแสดงเฉพาะป้ายที่กำหนด (เว้นเดือน / ทุก 5 วัน) */}
      <div
        aria-hidden="true"
        className="ml-10 grid"
        style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}
        data-testid="chart-axis-labels"
      >
        {months.map((month) => (
          <span
            key={month.key}
            className={`text-text-secondary overflow-visible text-center text-xs whitespace-nowrap ${
              month.axisOnNarrow ? "" : "max-sm:invisible"
            }`}
          >
            {month.axisLabel}
          </span>
        ))}
      </div>

      <details className="rounded-[12px] border p-3">
        <summary className="min-h-12 cursor-pointer content-center font-semibold">
          ดูเป็นตาราง
        </summary>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full min-w-[320px] text-left text-sm">
            <caption className="sr-only">
              {`${title}: ช่วยสำเร็จ ปิดโดยหัวหน้า ส่งต่อ ปล่อยเคส และจำนวนคนที่ช่วยได้`}
            </caption>
            <thead>
              <tr className="border-b">
                <th scope="col" className="py-2 pr-2">
                  {period === "month" ? "เดือน" : "วันที่"}
                </th>
                <th scope="col" className="py-2 pr-2 text-right">
                  ช่วยสำเร็จ
                </th>
                {types.map((type) => (
                  <th key={type} scope="col" className="py-2 pr-2 text-right">
                    {INCIDENT_REGISTRY[type].label.th}
                  </th>
                ))}
                <th scope="col" className="py-2 pr-2 text-right">
                  ปิดโดยหัวหน้า
                </th>
                <th scope="col" className="py-2 pr-2 text-right">
                  ส่งต่อ
                </th>
                <th scope="col" className="py-2 pr-2 text-right">
                  ปล่อยเคส
                </th>
                <th scope="col" className="py-2 text-right">
                  คนที่ช่วยได้
                </th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {months.map((month) => (
                <tr key={month.key} className="border-b last:border-b-0">
                  <th scope="row" className="py-2 pr-2 font-sans font-normal">
                    {month.label}
                  </th>
                  <td className="py-2 pr-2 text-right">{month.helped}</td>
                  {types.map((type) => (
                    <td key={type} className="py-2 pr-2 text-right">
                      {month.helpedByType[type] ?? 0}
                    </td>
                  ))}
                  <td className="py-2 pr-2 text-right">{month.leadClosed}</td>
                  <td className="py-2 pr-2 text-right">{month.referred}</td>
                  <td className="py-2 pr-2 text-right">{month.released}</td>
                  <td className="py-2 text-right">{month.peopleHelped}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

// แท่งโค้งเฉพาะปลายบน ฐานติดเส้นศูนย์
function barPath(x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + radius}Q${x},${y} ${x + radius},${y}H${x + w - radius}Q${x + w},${y} ${x + w},${y + radius}V${y + h}Z`;
}

function niceTicks(max: number): number[] {
  const step = max <= 5 ? 1 : max <= 10 ? 2 : Math.ceil(max / 5 / 5) * 5;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: top / step + 1 }, (_, i) => i * step);
}
