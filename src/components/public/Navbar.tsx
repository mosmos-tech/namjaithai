"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, type ReactNode } from "react";

import type { ReporterText } from "@/lib/i18n/reporter-text";
import { Logo } from "./Logo";

const NAV_LINKS = [
  { label: "แจ้งขอความช่วยเหลือ", href: "/request" },
  { label: "ติดตามเคส", href: "/track" },
  { label: "เบอร์สายด่วน", href: "/hotlines" },
  { label: "หน่วยกู้ภัย", href: "/units" },
  { label: "คู่มือเอาตัวรอด", href: "/survival" },
];

const subscribeHydration = () => () => {};
const browserReady = () => true;
const serverNotReady = () => false;

// account: คนที่ล็อกอินอยู่ (ส่งมาจาก NavbarWithAccount) — ไม่มี = ปุ่ม "เข้าสู่ระบบ"
// text: ข้อความของหน้า /en (TF-63) ส่งมาจาก layout — ไม่ส่งมา = ภาษาไทย (ไม่ต้องโหลด dictionary)
// languageSwitch: ปุ่มสลับภาษาของหน้าแรก (TF-63) แสดงนอกเมนู เห็นได้ทันทีทั้งจอคอมและมือถือ
export function Navbar({
  account,
  text,
  homeHref = "/",
  languageSwitch,
}: {
  account?: { href: string } | null;
  text?: ReporterText["chrome"];
  homeHref?: string;
  languageSwitch?: ReactNode;
}) {
  const navLinks = text?.nav ?? NAV_LINKS;
  const accountHref = account?.href ?? "/login";
  const accountLabel = account ? (text?.myPage ?? "หน้าของฉัน") : (text?.signIn ?? "เข้าสู่ระบบ");

  const [open, setOpen] = useState(false);
  const ready = useSyncExternalStore(subscribeHydration, browserReady, serverNotReady);

  return (
    <nav className="bg-bg-nav rounded-b-[20px] sm:rounded-b-3xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Logo */}
        <Link prefetch={false} href={homeHref} onClick={() => setOpen(false)}>
          <Logo />
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-1 md:flex">
          {navLinks.map(({ label, href }) => (
            <Link
              prefetch={false}
              key={href}
              href={href}
              className="font-heading text-text-primary hover:bg-primary-50 hover:text-primary-700 rounded-full px-3 py-2 text-sm font-semibold transition-colors"
            >
              {label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {languageSwitch}

          {/* Desktop login — outline */}
          <div className="hidden md:block">
            <Link
              prefetch={false}
              href={accountHref}
              className="border-border-strong bg-bg-surface font-heading text-text-primary hover:bg-bg-subtle active:bg-bg-subtle inline-flex h-12 items-center rounded-full border px-5 text-sm font-semibold transition-colors"
            >
              {accountLabel}
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            disabled={!ready}
            aria-label={open ? (text?.closeMenu ?? "ปิดเมนู") : (text?.openMenu ?? "เปิดเมนู")}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="text-text-primary hover:bg-primary-50 flex h-12 w-12 items-center justify-center rounded-full transition-colors md:hidden"
          >
            {open ? (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path
                  d="M4 4L16 16M16 4L4 16"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path
                  d="M3 5h14M3 10h14M3 15h14"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="border-border-default border-t px-4 pb-4 md:hidden">
          <div className="flex flex-col gap-1 pt-2">
            {navLinks.map(({ label, href }) => (
              <Link
                prefetch={false}
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="font-heading text-text-primary hover:bg-primary-50 hover:text-primary-700 rounded-full px-4 py-3 text-base font-semibold transition-colors"
              >
                {label}
              </Link>
            ))}
            <Link
              prefetch={false}
              href={accountHref}
              onClick={() => setOpen(false)}
              className="border-border-strong bg-bg-surface font-heading text-text-primary hover:bg-bg-subtle mt-2 flex h-12 items-center justify-center rounded-full border text-base font-semibold transition-colors"
            >
              {accountLabel}
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
