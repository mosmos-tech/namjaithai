import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "เบอร์สายด่วน — น้ำใจไทย SOS",
};

const HOTLINES = [
  {
    number: "1784",
    name: "กรมป้องกันและบรรเทาสาธารณภัย",
    shortName: "ปภ.",
    description: "ศูนย์ปฏิบัติการฉุกเฉิน แจ้งอุทกภัย วาตภัย อัคคีภัย ตลอด 24 ชั่วโมง",
    urgent: true,
  },
  {
    number: "1669",
    name: "สถาบันการแพทย์ฉุกเฉินแห่งชาติ",
    shortName: "กู้ชีพ",
    description: "เจ็บป่วยฉุกเฉิน บาดเจ็บ หมดสติ ส่งโรงพยาบาลฟรี ตลอด 24 ชั่วโมง",
    urgent: true,
  },
  {
    number: "199",
    name: "กู้ภัยมูลนิธิ",
    shortName: "กู้ภัย",
    description: "ช่วยเหลือผู้ประสบภัย กู้ภัยทางน้ำ ค้นหาผู้สูญหาย มูลนิธิอาสาสมัคร",
    urgent: false,
  },
  {
    number: "191",
    name: "สายด่วนตำรวจ",
    shortName: "ตำรวจ",
    description: "แจ้งเหตุร้าย ขอความช่วยเหลือด้านความปลอดภัย บุกรุก ลักทรัพย์",
    urgent: false,
  },
  {
    number: "1182",
    name: "การไฟฟ้าส่วนภูมิภาค",
    shortName: "การไฟฟ้า",
    description: "ไฟฟ้าขัดข้อง สายไฟฟ้าขาด ไฟฟ้าลัดวงจร อันตรายจากไฟฟ้าในพื้นที่น้ำท่วม",
    urgent: false,
  },
];

export default function HotlinesPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold text-text-primary">เบอร์สายด่วนฉุกเฉิน</h1>
        <p className="mt-2 text-base text-text-secondary">
          กดที่เบอร์เพื่อโทรออกได้ทันที — บริการฟรีตลอด 24 ชั่วโมง ไม่ต้องใช้เน็ต
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {HOTLINES.map(({ number, name, shortName, description, urgent }) => (
          <div
            key={number}
            className={`flex flex-col rounded-[14px] border p-5 ${
              urgent
                ? "border-red-600/20 bg-red-50"
                : "border-border-default bg-bg-surface"
            }`}
          >
            {/* Header: badge + ชื่อ + ตัวเลขเบอร์ */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 font-heading text-xs font-bold text-white ${
                    urgent ? "bg-red-600" : "bg-primary-700"
                  }`}
                >
                  {shortName}
                </span>
                <p className="mt-1.5 font-heading text-sm font-semibold text-text-primary">
                  {name}
                </p>
              </div>
              {/* ตัวเลขใช้ IBM Plex Mono — อ่านง่าย ไม่มีแอมบิกิวตี้ */}
              <span
                className={`font-mono text-3xl font-bold tabular-nums ${
                  urgent ? "text-red-600" : "text-primary-700"
                }`}
              >
                {number}
              </span>
            </div>

            {/* คำอธิบาย — flex-1 ดันปุ่มลงล่างให้เท่ากันทุกการ์ด */}
            <p className="mt-3 flex-1 text-sm leading-relaxed text-text-secondary">{description}</p>

            {/* ปุ่มโทร */}
            <a
              href={`tel:${number}`}
              className={`mt-4 flex h-12 items-center justify-center rounded-full font-heading text-base font-semibold text-white transition-colors ${
                urgent
                  ? "bg-red-600 hover:bg-red-600/90 active:bg-red-600/90"
                  : "bg-primary-600 hover:bg-primary-700 active:bg-primary-700"
              }`}
            >
              โทร {number}
            </a>
          </div>
        ))}
      </div>

      {/* กล่องศูนย์ประสานงานจังหวัด */}
      <div className="mt-8 rounded-[14px] border border-primary-100 bg-primary-50 p-5 sm:p-6">
        <h2 className="font-heading text-lg font-bold text-primary-700">
          ศูนย์ประสานงานในจังหวัดของคุณ
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-text-secondary">
          ติดต่อศูนย์ป้องกันและบรรเทาสาธารณภัยจังหวัดโดยตรงผ่าน{" "}
          <strong className="text-text-primary">ปภ. 1784 กด 2</strong>{" "}
          เพื่อโอนไปยังศูนย์จังหวัด หรือค้นหาเบอร์ศูนย์จังหวัดได้ที่เว็บไซต์{" "}
          <a
            href="https://www.disaster.go.th"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-primary-600 underline underline-offset-2 hover:text-primary-700"
          >
            disaster.go.th
          </a>
        </p>
      </div>
    </div>
  );
}
