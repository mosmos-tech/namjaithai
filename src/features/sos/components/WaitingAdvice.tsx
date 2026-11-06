import {
  INCIDENT_REGISTRY,
  IncidentType,
  type IncidentType as Incident,
} from "@/lib/domain/incidents";

// Official emergency numbers: https://dpmreporter.disaster.go.th/dpm/assets/uploads/pdf/pbP29oT0Tj1549298298.pdf
const HOTLINES: Record<Incident, readonly { number: string; label: string }[]> = {
  FLOOD: [
    { number: "1784", label: "ปภ." },
    { number: "1669", label: "แพทย์ฉุกเฉิน" },
  ],
  FIRE: [
    { number: "199", label: "ดับเพลิง" },
    { number: "1669", label: "แพทย์ฉุกเฉิน" },
  ],
  ROAD_ACCIDENT: [
    { number: "1669", label: "แพทย์ฉุกเฉิน" },
    { number: "191", label: "เหตุด่วน" },
  ],
  MEDICAL: [{ number: "1669", label: "แพทย์ฉุกเฉิน" }],
  WATER_RESCUE: [
    { number: "1784", label: "ปภ." },
    { number: "1669", label: "แพทย์ฉุกเฉิน" },
  ],
  COLLAPSE: [
    { number: "1784", label: "ปภ." },
    { number: "1669", label: "แพทย์ฉุกเฉิน" },
  ],
  ANIMAL: [{ number: "191", label: "เหตุด่วน" }],
  OTHER: [
    { number: "191", label: "เหตุด่วน" },
    { number: "1669", label: "แพทย์ฉุกเฉิน" },
  ],
};
export function WaitingAdvice({ incidentType }: { incidentType?: string }) {
  const type = Object.values(IncidentType).find((code) => code === incidentType);
  const advice = type ? INCIDENT_REGISTRY[type].waitingAdvice : [];
  const hotlines = type ? HOTLINES[type] : HOTLINES.OTHER;
  return (
    <section
      aria-labelledby="waiting-advice-heading"
      className="border-border-default bg-bg-surface rounded-[14px] border p-5 sm:p-8"
    >
      <h2
        id="waiting-advice-heading"
        className="font-heading text-text-primary text-[22px] font-semibold"
      >
        ระหว่างรอทีม ควรทำอะไร
      </h2>
      {advice.length ? (
        <ul className="mt-4 list-disc space-y-2 pl-6 text-lg">
          {advice.map((item) => (
            <li key={item.text.th}>{item.text.th}</li>
          ))}
        </ul>
      ) : (
        <p className="text-text-secondary mt-3">
          คำแนะนำเฉพาะเหตุอยู่ระหว่างตรวจสอบ กรุณาปฏิบัติตามคำแนะนำของเจ้าหน้าที่สายด่วน
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        {hotlines.map((line) => (
          <a
            key={line.number}
            href={`tel:${line.number}`}
            className="border-border-strong text-primary-700 inline-flex min-h-12 items-center rounded-full border px-4 font-semibold"
          >
            โทร {line.number} {line.label}
          </a>
        ))}
      </div>
    </section>
  );
}
