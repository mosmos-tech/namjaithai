import { cacheLife } from "next/cache";
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

export async function Footer() {
  return <FooterContent yearBE={await getBuddhistYear()} />;
}
