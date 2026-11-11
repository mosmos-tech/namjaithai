"use client";

import { Fragment, useState, type KeyboardEvent } from "react";
import type { ChartData } from "../chart-data";

// พื้นที่วาดแท่งอย่างเดียว (สัดส่วน 3:1) — ตัวหนังสือแกนอยู่นอก SVG เป็น HTML 12px
// เพราะตัวหนังสือใน SVG ย่อตามความกว้าง จอ 375px จะเหลือไม่ถึง 7px
const WIDTH = 600;
const HEIGHT = 200;
const PAD_TOP = 4;
const GAP = 2; // ช่องว่างสีพื้นระหว่างชั้นของแท่ง

/**
 * กราฟแท่งซ้อนผลงานหน่วย ใช้ร่วมกัน 2 หน้า (ข้อมูลแต่ละหน้าสร้างใน chart-data.ts)
 * - /unit/dashboard (TF-57): ช่วยสำเร็จแยกสีตามประเภทเหตุ รายเดือน / รายวันของเดือนที่เลือก
 * - /units/[id] (TF-61): 30 วันล่าสุด แยกสี ผู้แจ้งยืนยัน / หัวหน้าปิด
 * - SVG ล้วน ไม่ใช้ไลบรารี ย่อขยายตามความกว้าง ใช้ได้ที่ 375px
 *   ตัวหนังสือแกน 12px เสมอ จอแคบแสดงเฉพาะป้ายที่ axisOnNarrow
 * - แตะ/ชี้ที่แท่ง หรือกดลูกศรซ้ายขวา เห็นวันที่และจำนวนในแถบเหนือกราฟ
 * - มีตารางตัวเลขชุดเดียวกันให้โปรแกรมอ่านหน้าจอและคนที่แยกสีไม่ออก
 */
export function HelpedChart({ title, data }: { title: string; data: ChartData }) {
  const { series, bars, table } = data;
  const [active, setActive] = useState<number | null>(null);
  const totals = bars.map((bar) => bar.values.reduce((sum, value) => sum + value, 0));
  const max = Math.max(1, ...totals);
  const ticks = niceTicks(max);
  const top = ticks.at(-1)!;
  const plotHeight = HEIGHT - PAD_TOP;
  const slot = WIDTH / bars.length;
  const barWidth = Math.min(28, slot * 0.6);
  const y = (value: number) => PAD_TOP + plotHeight - (value / top) * plotHeight;

  function onKeyDown(event: KeyboardEvent) {
    const last = bars.length - 1;
    const next =
      event.key === "ArrowRight"
        ? Math.min(last, (active ?? -1) + 1)
        : event.key === "ArrowLeft"
          ? Math.max(0, (active ?? last + 1) - 1)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
  }

  return (
    <section aria-labelledby="helped-chart-heading" className="flex flex-col gap-3">
      <h2 id="helped-chart-heading" className="font-heading text-xl font-semibold">
        {title}
      </h2>

      {series.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label={data.legendLabel}>
          {series.map((item) => (
            <li key={item.key} className="text-text-secondary flex items-center gap-2 text-sm">
              <span
                aria-hidden="true"
                className="inline-block size-3 rounded-sm"
                style={{ backgroundColor: item.color }}
              />
              {item.label}
            </li>
          ))}
        </ul>
      )}

      {/* ตัวเลขของแท่งที่แตะ — สูงคงที่ กราฟไม่กระโดด */}
      <p
        aria-live="polite"
        className="bg-bg-surface min-h-12 rounded-[12px] border px-3 py-2 text-sm"
        data-testid="chart-readout"
      >
        {/* ตัดบรรทัดได้เฉพาะที่ตัวคั่น · (วันที่ "21 ต.ค. 2569" และแต่ละตัวเลขอยู่บรรทัดเดียวเสมอ) */}
        {active === null ? (
          <span className="text-text-secondary">แตะที่แท่งเพื่อดูวันที่และจำนวน</span>
        ) : (
          <>
            <span className="font-semibold whitespace-nowrap">{bars[active].fullLabel}</span>
            {" · "}
            <span className="whitespace-nowrap">{`${data.totalLabel} ${totals[active]} เคส`}</span>
            {series.map((item, index) =>
              series.length > 2 && bars[active].values[index] === 0 ? null : (
                <Fragment key={item.key}>
                  {" · "}
                  <span className="whitespace-nowrap">
                    <span
                      aria-hidden="true"
                      className="mr-1 inline-block size-2.5 rounded-sm"
                      style={{ backgroundColor: item.color }}
                    />
                    {`${item.label} ${bars[active].values[index]}`}
                  </span>
                </Fragment>
              ),
            )}
          </>
        )}
      </p>

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
        <div
          className="focus-visible:outline-primary-600 relative aspect-[3/1] min-w-0 flex-1 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4"
          tabIndex={0}
          role="group"
          aria-label={`${title} ใช้ลูกศรซ้ายขวาเลื่อนดูทีละแท่ง`}
          onKeyDown={onKeyDown}
          onPointerLeave={(event) => {
            // เมาส์ออกนอกกราฟแล้วล้าง แต่นิ้วแตะค้างค่าไว้ให้อ่าน
            if (event.pointerType === "mouse") setActive(null);
          }}
        >
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="absolute inset-0 h-full w-full overflow-visible"
            role="img"
            aria-label={`กราฟแท่ง${title} รายละเอียดอยู่ในตารางด้านล่าง`}
            data-testid="helped-chart"
          >
            {active !== null && (
              <rect
                x={slot * active}
                y={PAD_TOP}
                width={slot}
                height={plotHeight}
                className="text-primary-600"
                fill="currentColor"
                fillOpacity={0.1}
              />
            )}
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
            {bars.map((bar, index) => {
              const cx = slot * index + slot / 2;
              let base = 0;
              return (
                <g key={bar.key}>
                  {series.map((item, seriesIndex) => {
                    const value = bar.values[seriesIndex];
                    if (value === 0) return null;
                    const y0 = y(base);
                    base += value;
                    const y1 = y(base);
                    const isTop = base === totals[index];
                    const height = Math.max(1, y0 - y1 - (isTop ? 0 : GAP));
                    return (
                      <path
                        key={item.key}
                        d={barPath(cx - barWidth / 2, y1, barWidth, height, isTop ? 4 : 0)}
                        fill={item.color}
                      />
                    );
                  })}
                  {/* พื้นที่แตะใหญ่กว่าแท่ง (ทั้งช่อง) */}
                  <rect
                    x={slot * index}
                    y={PAD_TOP}
                    width={slot}
                    height={plotHeight}
                    fill="transparent"
                    data-testid="chart-slot"
                    onPointerEnter={(event) => {
                      if (event.pointerType === "mouse") setActive(index);
                    }}
                    onClick={() => setActive(index)}
                  />
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      {/* แกน X: 12px เสมอ แสดงเฉพาะป้ายที่กำหนดของจอแคบ/จอกว้าง (กันป้ายมีชื่อเดือนชนกัน) */}
      <div
        aria-hidden="true"
        className="ml-10 grid"
        style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}
        data-testid="chart-axis-labels"
      >
        {bars.map((bar, index) => (
          // ป้ายแรกชิดซ้ายของแท่ง (ล้นไปทางขวา ไม่ทับแกน Y) ป้ายอื่นอยู่กลางแท่ง ล้นเท่ากันสองข้าง
          <span
            key={bar.key}
            className={`text-text-secondary flex overflow-visible text-xs whitespace-nowrap ${
              index === 0 ? "justify-start" : "justify-center"
            } ${bar.axisOnNarrow ? "" : "max-sm:invisible"} ${bar.axisOnWide ? "" : "sm:invisible"}`}
          >
            {bar.axisLabel}
          </span>
        ))}
      </div>

      <details className="rounded-[12px] border p-3">
        <summary className="min-h-12 cursor-pointer content-center font-semibold">
          ดูเป็นตาราง
        </summary>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full min-w-[320px] text-left text-sm">
            <caption className="sr-only">{`${title}: ${table.columns.join(" ")}`}</caption>
            <thead>
              <tr className="border-b">
                <th scope="col" className="py-2 pr-2">
                  {table.periodHeader}
                </th>
                {table.columns.map((column, index) => (
                  <th
                    key={column}
                    scope="col"
                    className={`py-2 text-right ${index < table.columns.length - 1 ? "pr-2" : ""}`}
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono">
              {bars.map((bar, row) => (
                <tr key={bar.key} className="border-b last:border-b-0">
                  <th scope="row" className="py-2 pr-2 font-sans font-normal">
                    {bar.label}
                  </th>
                  {table.rows[row].map((value, index) => (
                    <td
                      key={table.columns[index]}
                      className={`py-2 text-right ${index < table.columns.length - 1 ? "pr-2" : ""}`}
                    >
                      {value}
                    </td>
                  ))}
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
