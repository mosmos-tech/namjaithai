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
    tips: [
      "ติดตามระดับน้ำจากกรมชลประทานและ กรมป้องกันฯ (1784) ทุกวัน",
      "ย้ายสิ่งของและเครื่องใช้ไฟฟ้าขึ้นที่สูง",
      "เตรียมถุงยังชีพ 72 ชั่วโมงตามเช็กลิสต์ด้านล่าง",
      "ถ่ายรูปทรัพย์สินและเก็บเอกสารสำคัญในที่กันน้ำ",
      "แจ้งญาติและเพื่อนบ้านให้รู้แผนอพยพของคุณ",
    ],
  },
  {
    phase: "ระหว่างน้ำท่วม",
    color: "border-amber-500/30 bg-amber-50",
    headingColor: "text-amber-700",
    tips: [
      "อย่าเดินลุยน้ำที่ไม่รู้ความลึก — น้ำ 15 ซม. อาจพัดล้มได้",
      "ปิดสวิตช์ไฟฟ้าหลักถ้าน้ำเข้าบ้าน และโทร 1182 แจ้งการไฟฟ้า",
      "อย่าขับรถผ่านถนนที่น้ำท่วม แม้รถจะดูสูงพอ",
      "ฟังประกาศจากวิทยุพกพาหรือ ปภ. อย่างสม่ำเสมอ",
      "หากติดอยู่บนหลังคาให้สัญญาณด้วยนกหวีด 3 ครั้ง หรือผ้าสีสด",
    ],
  },
  {
    phase: "หลังน้ำลด",
    color: "border-green-700/20 bg-green-50",
    headingColor: "text-green-700",
    tips: [
      "ตรวจสอบโครงสร้างบ้านก่อนเข้า — ระวังการทรุดตัวและรั่วซึม",
      "ห้ามเปิดไฟฟ้าจนกว่าช่างไฟฟ้าจะตรวจและรับรองความปลอดภัย",
      "ทิ้งอาหารทุกอย่างที่โดนน้ำท่วม — ความเสี่ยงจากเชื้อโรคสูงมาก",
      "สวมถุงมือยางและรองเท้าบู๊ตขณะทำความสะอาด",
      "ถ่ายรูปความเสียหายทันทีเพื่อยื่นประกันและขอความช่วยเหลือจากรัฐ",
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
        {/* Guides — ซ้าย */}
        <div className="flex flex-col gap-4">
          {GUIDES.map(({ phase, color, headingColor, tips }) => (
            <div key={phase} className={`rounded-[14px] border p-5 ${color}`}>
              <h2 className={`font-heading text-lg font-bold ${headingColor}`}>{phase}</h2>
              <ul className="mt-3 flex flex-col gap-2">
                {tips.map((tip) => (
                  <li key={tip} className="flex items-start gap-2 text-sm text-text-primary">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-50" />
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
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
