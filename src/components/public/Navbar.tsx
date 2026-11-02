"use client";

import Link from "next/link";
import { useState } from "react";

import { Logo } from "./Logo";

const NAV_LINKS = [
  { label: "แจ้งขอความช่วยเหลือ", href: "/request" },
  { label: "ติดตามเคส", href: "/track" },
  { label: "เบอร์สายด่วน", href: "/hotlines" },
  { label: "คู่มือเอาตัวรอด", href: "/survival" },
];

// account: คนที่ล็อกอินอยู่ (ส่งมาจาก NavbarWithAccount) — ไม่มี = ปุ่ม "เข้าสู่ระบบ"
export function Navbar({ account }: { account?: { href: string } | null }) {
  const accountHref = account?.href ?? "/login";
  const accountLabel = account ? "หน้าของฉัน" : "เข้าสู่ระบบ";

  const [open, setOpen] = useState(false);

  return (
    <nav className="bg-bg-nav rounded-b-[20px] sm:rounded-b-3xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Logo */}
        <Link href="/" onClick={() => setOpen(false)}>
          <Logo />
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className="rounded-full px-3 py-2 font-heading text-sm font-semibold text-text-primary transition-colors hover:bg-primary-50 hover:text-primary-700"
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Desktop login — outline */}
        <div className="hidden md:block">
          <Link
            href={accountHref}
            className="inline-flex h-12 items-center rounded-full border border-border-strong bg-bg-surface px-5 font-heading text-sm font-semibold text-text-primary transition-colors hover:bg-bg-subtle active:bg-bg-subtle"
          >
            {accountLabel}
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          aria-label={open ? "ปิดเมนู" : "เปิดเมนู"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex h-12 w-12 items-center justify-center rounded-full text-text-primary transition-colors hover:bg-primary-50 md:hidden"
        >
          {open ? (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M4 4L16 16M16 4L4 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="border-t border-border-default px-4 pb-4 md:hidden">
          <div className="flex flex-col gap-1 pt-2">
            {NAV_LINKS.map(({ label, href }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="rounded-full px-4 py-3 font-heading text-base font-semibold text-text-primary transition-colors hover:bg-primary-50 hover:text-primary-700"
              >
                {label}
              </Link>
            ))}
            <Link
              href={accountHref}
              onClick={() => setOpen(false)}
              className="mt-2 flex h-12 items-center justify-center rounded-full border border-border-strong bg-bg-surface font-heading text-base font-semibold text-text-primary transition-colors hover:bg-bg-subtle"
            >
              {accountLabel}
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
