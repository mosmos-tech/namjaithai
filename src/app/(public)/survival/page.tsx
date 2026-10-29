import type { Metadata } from "next";

import { SurvivalChecklist } from "@/components/public/SurvivalChecklist";

export const metadata: Metadata = {
  title: "คู่มือเอาตัวรอด — น้ำใจไทย SOS",
};

const GUIDES = [
  {
    phase: "ก่อนน้ำจะมา",
    color: "border-primary-100 bg-primary-50",
    headingColor: "text-primary-700",
    markerColor: "bg-primary-700",
    tips: [
      "ติดตามระดับน้ำจากกรมชลประทานและกรมป้องกันและบรรเทาสาธารณภัย (โทร 1784) ทุกวัน",
      "ย้ายสิ่งของและเครื่องใช้ไฟฟ้าทั้งหมดขึ้นไว้บนที่สูง",
      "เตรียมถุงยังชีพ 72 ชั่วโมงตามเช็กลิสต์ด้านขวา",
      "ถ่ายรูปทรัพย์สินและเก็บเอกสารสำคัญในซองกันน้ำ",
      "แจ้งญาติและเพื่อนบ้านให้รู้แผนอพยพของคุณล่วงหน้า",
    ],
  },
  {
    phase: "ระหว่างน้ำท่วม",
    color: "border-amber-500/30 bg-amber-50",
    headingColor: "text-amber-700",
    markerColor: "bg-amber-700",
    tips: [
      "อย่าเดินลุยน้ำที่ไม่รู้ความลึก — น้ำแค่ 15 ซม. อาจพัดให้ล้มได้",
      "ปิดสวิตช์ไฟฟ้าหลักทันทีที่น้ำเข้าบ้าน แล้วโทรแจ้งการไฟฟ้า 1182",
      "ห้ามขับรถผ่านถนนที่น้ำท่วม แม้รถจะดูสูงพอ",
      "ฟังประกาศจากวิทยุพกพาหรือ ปภ. อย่างสม่ำเสมอ",
      "หากติดอยู่บนหลังคา ให้สัญญาณด้วยนกหวีด 3 ครั้งต่อเนื่อง หรือโบกผ้าสีสด",
    ],
  },
  {
    phase: "หลังน้ำลด",
    color: "border-green-700/20 bg-green-50",
    headingColor: "text-green-700",
    markerColor: "bg-green-700",
    tips: [
      "ตรวจสอบโครงสร้างบ้านจากภายนอกก่อนเข้า — ระวังการทรุดตัวและรั่วซึม",
      "ห้ามเปิดไฟฟ้าจนกว่าช่างจะตรวจและรับรองความปลอดภัยแล้ว",
      "ทิ้งอาหารทุกอย่างที่สัมผัสน้ำท่วม — เสี่ยงเชื้อโรคสูงมาก",
      "สวมถุงมือยางและรองเท้าบู๊ตตลอดเวลาที่ทำความสะอาด",
      "ถ่ายรูปความเสียหายทันทีเพื่อใช้ยื่นประกันและขอความช่วยเหลือจากภาครัฐ",
    ],
  },
];

export default function SurvivalPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold text-text-primary">คู่มือเอาตัวรอดจากน้ำท่วม</h1>
        <p className="mt-2 text-base text-text-secondary">
          ข้อมูลพื้นฐานที่ควรรู้และเช็กลิสต์อุปกรณ์ 72 ชั่วโมง
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Guides — ซ้าย (accordion ด้วย <details> native) */}
        <div className="flex flex-col gap-3">
          {GUIDES.map(({ phase, color, headingColor, markerColor, tips }) => (
            <details key={phase} className={`group rounded-[14px] border ${color}`}>
              <summary className="flex cursor-pointer list-none items-center justify-between p-5 [&::-webkit-details-marker]:hidden">
                <h2 className={`font-heading text-lg font-bold ${headingColor}`}>{phase}</h2>
                {/* chevron หมุน 180° เมื่อ open */}
                <svg
                  className={`h-5 w-5 shrink-0 opacity-60 transition-transform duration-200 group-open:rotate-180 ${headingColor}`}
                  viewBox="0 0 20 20"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M5 7.5L10 12.5L15 7.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </summary>

              <ol className="flex flex-col gap-3 px-5 pb-5">
                {tips.map((tip, i) => (
                  <li key={tip} className="flex items-start gap-3">
                    {/* เลขข้อ */}
                    <span
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${markerColor}`}
                    >
                      {i + 1}
                    </span>
                    {/* ข้อความ — text-wrap:pretty ให้ browser เลือกจุดตัดที่สวยกว่า */}
                    <span className="text-sm leading-relaxed text-text-primary [text-wrap:pretty]">
                      {tip}
                    </span>
                  </li>
                ))}
              </ol>
            </details>
          ))}
        </div>

        {/* Checklist — ขวา sticky บนจอใหญ่ */}
        <div className="lg:sticky lg:top-28 lg:self-start">
          <SurvivalChecklist />
        </div>
      </div>
    </div>
  );
}
