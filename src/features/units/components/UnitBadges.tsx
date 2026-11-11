import { UNIT_CAPABILITY_LABELS, type PublicUnit } from "@/lib/domain";

/** ป้ายสถานะหน่วย: ข้อมูลตัวอย่าง (DEMO) / ยังไม่ได้ใช้ระบบ (OSM ที่ยังไม่เปิดใช้) */
export function UnitStatusBadges({ unit }: { unit: PublicUnit }) {
  return (
    <>
      {unit.isDemo && (
        <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">
          ข้อมูลตัวอย่าง
        </span>
      )}
      {unit.notInService && (
        <span className="bg-bg-nav text-text-secondary rounded-full px-3 py-1 text-sm font-semibold">
          ยังไม่ได้ใช้ระบบ
        </span>
      )}
    </>
  );
}

export function UnitCapabilityList({ unit }: { unit: PublicUnit }) {
  if (unit.capabilities.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="ความสามารถของหน่วย">
      {unit.capabilities.map((capability) => (
        <li
          key={capability}
          className="bg-bg-subtle text-primary-700 rounded-full px-3 py-1 text-sm font-semibold"
        >
          {UNIT_CAPABILITY_LABELS[capability]}
        </li>
      ))}
    </ul>
  );
}

export function UnitHotline({ unit }: { unit: PublicUnit }) {
  if (!unit.hotline) return null;
  return (
    <a
      href={`tel:${unit.hotline.replace(/[^\d+]/g, "")}`}
      className="border-primary-600 text-primary-700 inline-flex min-h-12 items-center gap-2 self-start rounded-full border-2 bg-white px-5 font-semibold"
    >
      <span aria-hidden="true">☎</span>
      {`โทรสายด่วน ${unit.hotline}`}
    </a>
  );
}

export function OsmCredit() {
  return (
    <p className="text-text-secondary text-sm" data-testid="osm-credit">
      ข้อมูลหน่วยที่ยังไม่ได้ใช้ระบบมาจาก{" "}
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
        className="underline underline-offset-2"
      >
        © OpenStreetMap contributors
      </a>
    </p>
  );
}
