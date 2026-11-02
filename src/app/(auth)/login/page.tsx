/* eslint-disable @next/next/no-img-element -- ไอคอน SVG เล็กจาก Figma */
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LineLogo } from "@/components/public/LineLogo";
import { Logo } from "@/components/public/Logo";
import { homePathForRole, safeNextPath, userRoleLabel } from "@/lib/domain";
import { getCurrentAppUser } from "@/features/auth/server/app-user";

export const metadata: Metadata = {
  title: "เข้าใช้งาน — น้ำใจไทย SOS",
};

// ข้อความตาม ?error= ที่ /auth/callback หรือ proxy ส่งกลับมา
const ERROR_TEXT: Record<string, string> = {
  cancelled: "ยกเลิกการเข้าสู่ระบบด้วย LINE แล้ว",
  line: "เข้าสู่ระบบด้วย LINE ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
  profile: "ไม่สามารถอ่านข้อมูลบัญชี LINE ได้ กรุณาลองใหม่อีกครั้ง",
  inactive: "บัญชีนี้ยังใช้งานไม่ได้ (รออนุมัติหรือถูกระงับ) ติดต่อหัวหน้าหน่วยของคุณ",
};

type SearchParams = PageProps<"/login">["searchParams"];

/**
 * หน้าเข้าใช้งานหน้าเดียวสำหรับทุกคน (TF-17) — มีแค่ 2 ทาง ไม่มีฟอร์มสมัคร
 * ขนาด/สี/ฟอนต์ตาม Figma: จอคอม D1 (แบ่งสองฝั่ง) และมือถือ MC4
 */
export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <div className="flex flex-1 flex-col lg:min-h-dvh lg:flex-row">
      <BrandPanel />

      <div className="flex flex-1 flex-col px-6 pt-10 pb-8 lg:items-center lg:justify-center lg:px-10 lg:py-16">
        <div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col lg:flex-none lg:gap-5">
          <h1 className="font-heading text-text-primary text-[38px] leading-[1.18] font-bold tracking-[-0.57px] lg:text-[44px] lg:tracking-[-0.66px]">
            เข้าใช้งาน
          </h1>
          <p className="text-text-secondary hidden text-[20px] leading-[1.65] lg:block">
            เลือก 1 ทางที่ตรงกับคุณ
          </p>

          <Suspense fallback={null}>
            <LoginStatus searchParams={searchParams} />
          </Suspense>

          <OptionLabel number="01">ต้องการความช่วยเหลือ</OptionLabel>
          <SosOption />

          <div className="flex items-center gap-4 max-lg:my-9">
            <span className="bg-border-default h-px flex-1" />
            <span className="text-text-secondary text-lg leading-[1.65] lg:text-base lg:leading-[1.4] lg:font-medium">
              หรือ
            </span>
            <span className="bg-border-default h-px flex-1" />
          </div>

          <OptionLabel number="02">มีบัญชี LINE</OptionLabel>
          <section className="lg:border-border-strong lg:bg-bg-surface lg:flex lg:flex-col lg:gap-4 lg:rounded-[14px] lg:border lg:p-6">
            <h2 className="font-heading text-text-primary hidden text-[22px] leading-[1.3] font-semibold tracking-[-0.11px] lg:block">
              เข้าสู่ระบบด้วย LINE
            </h2>
            <p className="text-text-secondary hidden text-lg leading-[1.65] lg:block">
              ใช้ได้กับทุกคน ทั้งผู้ใช้ทั่วไป ทีมกู้ภัย หัวหน้าหน่วย และแอดมิน
            </p>
            <Suspense fallback={<LineButton href="/auth/line" />}>
              <LineButtonWithNext searchParams={searchParams} />
            </Suspense>
            <p className="text-text-secondary mt-4 text-center text-lg leading-[1.65] lg:hidden">
              สำหรับทีมกู้ภัย หัวหน้าหน่วย แอดมิน
              <br />
              และผู้ที่อยากดูเคสของตัวเอง
            </p>
            <div className="bg-primary-50 hidden gap-3 rounded-[12px] px-4 py-3.5 lg:flex">
              <img src="/brand/icon-shield.svg" alt="" className="size-[22px] shrink-0" />
              <p className="text-text-primary text-lg leading-[1.65]">
                ทีมกู้ภัย หัวหน้าหน่วย และแอดมิน ต้องเข้าทางนี้
                <br />
                ระบบจะตรวจสิทธิ์จากบัญชี LINE ของคุณ
              </p>
            </div>
          </section>

          <NoSignUpNote />
        </div>
      </div>
    </div>
  );
}

// แผงน้ำเงินด้านซ้าย เฉพาะจอคอม (Figma: Brand panel 560px)
function BrandPanel() {
  return (
    <aside className="bg-primary-600 text-text-on-primary relative hidden w-[560px] shrink-0 flex-col gap-8 overflow-hidden p-[72px] lg:flex">
      <Link href="/" aria-label="กลับหน้าแรก" className="self-start">
        <Logo size="lg" tone="onBlue" />
      </Link>
      <div className="h-6" />
      <p className="font-heading text-[44px] leading-[1.18] font-bold tracking-[-0.66px]">
        เข้าใช้งาน
        <br />
        น้ำใจไทย SOS
      </p>
      <p className="text-[20px] leading-[1.65]">
        หน้าเดียวสำหรับทุกคน
        <br />
        ผู้ประสบภัยขอความช่วยเหลือได้ทันที
        <br />
        ส่วนทีมกู้ภัยเข้าผ่าน LINE เพื่อยืนยันสิทธิ์
      </p>
      <WaterGauge />
    </aside>
  );
}

// "01 ต้องการความช่วยเหลือ" — ป้ายเลขข้อ เฉพาะจอคอม
function OptionLabel({
  number,
  className = "",
  children,
}: {
  number: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p className={`hidden items-center gap-2.5 lg:flex ${className}`}>
      <span className="text-primary-600 font-mono text-[17px] leading-[1.3] font-semibold">
        {number}
      </span>
      <span className="text-text-secondary text-base leading-[1.4] font-medium">{children}</span>
    </p>
  );
}

// ปุ่มแดง: ขอความช่วยเหลือโดยไม่ล็อกอิน (มือถือข้อความสั้นกว่า ตาม MC4)
function SosOption() {
  return (
    <Link
      href="/request"
      className="text-text-on-primary flex items-center gap-4 rounded-[16px] bg-red-600 py-[30px] pr-5 pl-6 shadow-[0_6px_0_0_rgba(191,26,26,0.28)] transition-[filter] hover:brightness-110 max-lg:mt-8 lg:rounded-[14px] lg:py-[22px]"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1.5 lg:gap-1">
        <span className="font-heading text-[28px] leading-[1.25] font-bold tracking-[-0.28px] max-[389px]:text-[25px] lg:text-[30px] lg:tracking-[-0.3px]">
          ขอความช่วยเหลือ<span className="hidden lg:inline">ทันที</span>
        </span>
        <span className="text-[20px] leading-[1.65] opacity-92 lg:text-lg">
          ไม่ต้องเข้าสู่ระบบ<span className="hidden lg:inline"> · ไม่ต้องสมัคร</span>
        </span>
      </span>
      <span className="bg-bg-surface shrink-0 rounded-[10px] px-3.5 py-2.5 font-mono text-[17px] leading-[1.3] font-semibold text-red-600 lg:text-[32px] lg:leading-[1.15] lg:font-bold lg:tracking-[-0.64px]">
        SOS
      </span>
    </Link>
  );
}

function LineButton({ href }: { href: string }) {
  return (
    <a
      href={href}
      className="bg-line-green font-heading text-text-on-primary flex w-full items-center justify-center gap-2.5 rounded-full px-8 py-[18px] text-[19px] leading-[1.2] font-semibold transition-[filter] hover:brightness-95"
    >
      <LineLogo className="size-7" />
      เข้าสู่ระบบด้วย LINE
    </a>
  );
}

// ถ้าโดนพามาจากหน้าที่ต้องล็อกอิน (?next=/rescue) ส่งต่อไปให้ /auth/line จำไว้
async function LineButtonWithNext({ searchParams }: { searchParams: SearchParams }) {
  const { next } = await searchParams;
  const safe = safeNextPath(typeof next === "string" ? next : null);
  return <LineButton href={safe ? `/auth/line?next=${encodeURIComponent(safe)}` : "/auth/line"} />;
}

function NoSignUpNote() {
  return (
    <>
      {/* มือถือ: ชิดล่างจอ ตรงกลาง */}
      <p className="text-text-secondary mt-auto pt-12 text-center text-base leading-[1.55] lg:hidden">
        ไม่มีการสมัครสมาชิกบนเว็บ
        <br />
        ทีมกู้ภัยสมัครผ่านลิงก์ใน LINE ของหน่วย
      </p>
      {/* จอคอม: เส้นคั่นบน + แถบเหลือง */}
      <div className="border-border-default hidden gap-3 border-t pt-4 lg:flex">
        <span className="w-[3px] shrink-0 bg-amber-500" />
        <p className="text-text-secondary text-base leading-[1.55]">
          ไม่มีการสมัครสมาชิกบนเว็บ
          <br />
          ทีมกู้ภัยใหม่สมัครผ่านลิงก์ที่หัวหน้าหน่วยส่งให้ใน LINE
        </p>
      </div>
    </>
  );
}

// error จากการล็อกอิน หรือบอกว่าล็อกอินอยู่แล้ว
async function LoginStatus({ searchParams }: { searchParams: SearchParams }) {
  const [{ error }, user] = await Promise.all([searchParams, getCurrentAppUser()]);
  const errorText = typeof error === "string" ? ERROR_TEXT[error] : undefined;
  if (!errorText && !(user && user.status === "ACTIVE")) return null;

  return (
    <div className="flex flex-col gap-3 max-lg:mt-6">
      {errorText && (
        <p role="alert" className="rounded-[12px] bg-red-50 px-4 py-3 text-lg text-red-600">
          {errorText}
        </p>
      )}
      {user && user.status === "ACTIVE" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-green-50 px-4 py-3">
          <p className="text-text-primary text-lg">
            เข้าสู่ระบบอยู่แล้ว: <strong>{user.displayName}</strong> ({userRoleLabel[user.role]})
          </p>
          <Link
            href={homePathForRole(user.role)}
            className="font-heading inline-flex min-h-12 items-center rounded-full bg-green-700 px-5 text-lg font-semibold text-white hover:brightness-110"
          >
            ไปหน้าของฉัน
          </Link>
        </div>
      )}
    </div>
  );
}

// ลายประจำ: ไม้วัดระดับน้ำ (Figma: Gauge 416×60) ขีดทุก 13px ยาวทุก 8 ขีด (0.5 ม.) กลางทุก 4 ขีด
function WaterGauge() {
  const ticks = Array.from({ length: 33 }, (_, i) => i);
  return (
    <div
      className="absolute bottom-10 left-[72px] h-[60px] w-[416px] overflow-hidden"
      aria-hidden="true"
    >
      {ticks.map((i) => {
        const major = i % 8 === 0;
        const mid = !major && i % 4 === 0;
        const height = major ? 44 : mid ? 26 : 14;
        return (
          <span
            key={i}
            className="bg-primary-100 absolute bottom-0 w-[2px] opacity-85"
            style={{ left: i * 13, height }}
          />
        );
      })}
      {[0, 0.5, 1, 1.5, 2].map((m, k) => (
        <span
          key={m}
          className="text-primary-100 absolute top-4 text-[13px] leading-[1.55] whitespace-nowrap"
          style={{ left: k * 104 + 6 }}
        >
          {m.toFixed(1)} ม.
        </span>
      ))}
    </div>
  );
}
