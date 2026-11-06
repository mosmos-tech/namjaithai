import Link from "next/link";
import { OnboardingPopup } from "@/components/public/OnboardingPopup";
import { SituationBoard } from "@/features/home/SituationBoard";

// หน้าแรกสาธารณะ (TF-46) แสดงผ่าน src/pages/index.tsx เพื่อให้หน้าแรกเบาตามเกณฑ์ TF-41
export function HomeContent() {
  return (
    <div className="bg-white px-5 py-10 sm:py-16">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-8 lg:grid-cols-[1.25fr_1fr] lg:gap-16">
          <section aria-labelledby="home-heading" className="max-w-xl">
            <p className="font-semibold text-red-700">— เปิดรับแจ้งเหตุตลอด 24 ชั่วโมง</p>
            <h1
              id="home-heading"
              className="font-heading text-text-primary mt-5 text-3xl font-bold sm:text-5xl"
            >
              ต้องการความช่วยเหลือ
              <br />
              กดปุ่มแดงนี้ได้เลย
            </h1>
            <p className="text-text-secondary mt-5 text-lg">
              บอกตำแหน่งของคุณ ทีมกู้ภัยในพื้นที่จะเห็นบนแผนที่ทันที แล้วโทรกลับหาคุณ
            </p>
            <Link
              href="/incidents"
              className="mt-6 flex min-h-24 items-center justify-between gap-5 rounded-xl bg-red-700 px-6 py-5 text-white shadow-[0_5px_0_#edc3c3] hover:bg-red-800"
            >
              <span>
                <strong className="font-heading block text-2xl">แจ้งขอความช่วยเหลือ</strong>
                <span>ไม่ต้องสมัคร · ใช้เวลาประมาณ 1 นาที</span>
              </span>
              <span className="rounded-lg bg-white px-3 py-4 text-xl font-bold text-red-700">
                SOS
              </span>
            </Link>
            <p className="text-text-secondary mt-6">
              เคยแจ้งไว้แล้ว?{" "}
              <Link className="text-primary-700 font-semibold underline" href="/track">
                ติดตามเคสของฉัน
              </Link>
            </p>
          </section>
          <SituationBoard />
        </div>
        <div
          aria-hidden="true"
          className="mt-14 h-4 border-b-2 border-blue-600 bg-[repeating-linear-gradient(to_right,#2563eb_0_1px,transparent_1px_12px)] bg-bottom bg-repeat-x"
        />
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {[
            [
              "01",
              "ติดตามเคสของฉัน",
              "กรอกรหัสเคส ดูว่าทีมไหนรับและมาถึงไหนแล้ว",
              "/track",
              "ติดตามเคส",
            ],
            [
              "02",
              "เบอร์สายด่วน",
              "1669 · 1784 · 199 กดโทรได้แม้เน็ตไม่ดี",
              "/hotlines",
              "ดูเบอร์ทั้งหมด",
            ],
            [
              "03",
              "คู่มือเอาตัวรอด",
              "ทำอะไรก่อน-หลัง เมื่อเกิดเหตุ อ่านได้แบบออฟไลน์",
              "/survival",
              "อ่านคู่มือ",
            ],
          ].map(([number, title, description, href, action]) => (
            <section
              key={number}
              className="border-border-default border-b pb-5 sm:border-r sm:border-b-0 sm:pr-6"
            >
              <p className="text-primary-700 font-bold">{number}</p>
              <h2 className="font-heading mt-2 text-xl font-semibold">{title}</h2>
              <p className="text-text-secondary mt-2">{description}</p>
              <Link href={href} className="text-primary-700 mt-3 inline-block font-semibold">
                {action} ›
              </Link>
            </section>
          ))}
        </div>
      </div>
      <OnboardingPopup />
    </div>
  );
}
