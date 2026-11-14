import type { GetServerSideProps } from "next";
import Head from "next/head";
import { EnvBanner } from "@/components/EnvBanner";
import { FooterContent } from "@/components/public/FooterContent";
import { Navbar } from "@/components/public/Navbar";
import { HotlineBar } from "@/components/public/HotlineBar";
import { LanguageSwitch } from "@/components/public/LanguageSwitch";
import { HomeContent } from "@/features/home/HomeContent";
import { getSessionUserRow } from "@/features/auth/server/session-user";
import { PwaSupport } from "@/features/pwa/PwaSupport";
import { homePathForRole, type UserRole } from "@/lib/domain";
import { createPagesClient } from "@/lib/supabase/pages";

type HomeProps = { account: { href: string; role: UserRole } | null; yearBE: number };

export const getServerSideProps: GetServerSideProps<HomeProps> = async ({ req }) => {
  const user = await getSessionUserRow(createPagesClient(req));
  const account =
    user?.status === "ACTIVE" ? { href: homePathForRole(user.role), role: user.role } : null;
  return { props: { account, yearBE: new Date().getFullYear() + 543 } };
};

/**
 * หน้าแรก (TF-46) ทำด้วย Pages Router เพื่อให้เบาตามเกณฑ์ TF-41 (ไม่เกิน 150 KB gzip)
 * App Router ทั้งชุดหนักราว 206 KB — หน้าอื่นทั้งหมดยังเป็น App Router ใน src/app
 * เนื้อหาอยู่ใน src/features/home/HomeContent.tsx
 */
export default function HomePage({ account, yearBE }: HomeProps) {
  return (
    <div data-lightweight-home className="flex min-h-dvh flex-col">
      <Head>
        <title>น้ำใจไทย SOS</title>
        <meta name="description" content="ระบบขอและประสานความช่วยเหลือในภาวะวิกฤต" />
        <meta name="theme-color" content="#1F6FD1" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="น้ำใจไทย SOS" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/pwa/apple-touch-icon.png" />
      </Head>
      <EnvBanner />
      <header className="sticky top-0 z-50">
        <HotlineBar />
        {/* TF-63: หน้าแรกไม่แปล มีแค่ปุ่ม EN พาไปฟอร์มภาษาอังกฤษ (/api/lang จำภาษาแล้วพาไป /en/request) */}
        <Navbar
          account={account}
          trackPath={false}
          languageSwitch={
            <LanguageSwitch locale="th" path="/request" label="เปลี่ยนภาษา" compactOnMobile />
          }
        />
      </header>
      <main className="flex-1">
        <HomeContent />
      </main>
      <FooterContent yearBE={yearBE} />
      <PwaSupport />
    </div>
  );
}
