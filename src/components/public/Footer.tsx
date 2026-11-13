import { cacheLife } from "next/cache";
import type { ReporterText } from "@/lib/i18n/reporter-text";
import { FooterContent } from "./FooterContent";

/**
 * คำนวณปี พ.ศ. ปัจจุบัน — cache 1 วัน
 * ป้องกัน "unstable value new Date()" ขณะ prerender
 */
async function getBuddhistYear(): Promise<number> {
  "use cache";
  cacheLife("days");
  return new Date().getFullYear() + 543;
}

/** text: footer ภาษาอังกฤษของหน้า /en (TF-63) — ไม่ส่งมา = ภาษาไทย */
export async function Footer({ text }: { text?: ReporterText["chrome"] }) {
  return <FooterContent yearBE={await getBuddhistYear()} text={text} />;
}
