import Link from "next/link";

import { format } from "@/lib/i18n/locale";
import type { ReporterText } from "@/lib/i18n/reporter-text";
import { Logo } from "./Logo";

/** text: ข้อความของหน้า /en (TF-63) — ไม่ส่งมา = ภาษาไทย */
export function FooterContent({ yearBE, text }: { yearBE: number; text?: ReporterText["chrome"] }) {
  if (text) return <FooterContentLocalized yearBE={yearBE} text={text} />;
  return (
    <footer data-root-footer className="border-border-default bg-bg-nav mt-auto border-t">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
        {/* แถวหลัก: logo ซ้าย · disclaimer ขวา */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Logo size="sm" />

          {/* Disclaimer + ลิงก์ คั่นด้วย · */}
          <p className="text-text-secondary text-xs leading-relaxed sm:text-right">
            ระบบประสานงานอาสา ไม่ใช่หน่วยงานรัฐ
            <span className="mx-2 opacity-50 select-none">·</span>
            กรณีฉุกเฉินโทร&nbsp;1669 หรือ&nbsp;1784
            <span className="mx-2 opacity-50 select-none">·</span>
            <Link
              prefetch={false}
              href="/units"
              className="hover:text-primary-600 underline underline-offset-2"
            >
              หน่วยกู้ภัย
            </Link>
            <span className="mx-2 opacity-50 select-none">·</span>
            <Link
              prefetch={false}
              href="/privacy"
              className="hover:text-primary-600 underline underline-offset-2"
            >
              นโยบายความเป็นส่วนตัว
            </Link>
          </p>
        </div>

        {/* ลิขสิทธิ์ */}
        <p className="border-border-default text-text-secondary mt-4 border-t pt-4 text-xs">
          © พ.ศ. {yearBE} น้ำใจไทย SOS —
          ข้อมูลทุกอย่างในระบบใช้เพื่อการช่วยเหลือในภาวะฉุกเฉินเท่านั้น
        </p>
      </div>
    </footer>
  );
}

function FooterContentLocalized({
  yearBE,
  text,
}: {
  yearBE: number;
  text: ReporterText["chrome"];
}) {
  return (
    <footer className="border-border-default bg-bg-nav mt-auto border-t">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Logo size="sm" />
          <p className="text-text-secondary text-xs leading-relaxed sm:text-right">
            {text.footerNotGov}
            <span className="mx-2 opacity-50 select-none">·</span>
            {text.footerEmergency}
            <span className="mx-2 opacity-50 select-none">·</span>
            <Link
              prefetch={false}
              href="/units"
              className="hover:text-primary-600 underline underline-offset-2"
            >
              {text.footerUnits}
            </Link>
            <span className="mx-2 opacity-50 select-none">·</span>
            <Link
              prefetch={false}
              href="/privacy"
              className="hover:text-primary-600 underline underline-offset-2"
            >
              {text.footerPrivacy}
            </Link>
          </p>
        </div>
        <p className="border-border-default text-text-secondary mt-4 border-t pt-4 text-xs">
          {format(text.footerCopyright, { yearBE, yearCE: yearBE - 543 })}
        </p>
      </div>
    </footer>
  );
}
