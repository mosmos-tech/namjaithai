import { createServerClient } from "@supabase/ssr";
import type { GetServerSideProps } from "next";
import Head from "next/head";
import { FooterContent } from "@/components/public/FooterContent";
import { Navbar } from "@/components/public/Navbar";
import { HotlineBar } from "@/components/public/HotlineBar";
import { getSessionUserRow } from "@/features/auth/server/session-user";
import { PwaSupport } from "@/features/pwa/PwaSupport";
import { homePathForRole } from "@/lib/domain";

type HomeProps = { account: { href: string } | null; yearBE: number };

export const getServerSideProps: GetServerSideProps<HomeProps> = async ({ req }) => {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () =>
          Object.entries(req.cookies).flatMap(([name, value]) =>
            value === undefined ? [] : [{ name, value }],
          ),
        // The proxy refreshes the session and forwards the new cookies to this request.
        setAll() {},
      },
    },
  );
  const user = await getSessionUserRow(supabase);
  const account = user?.status === "ACTIVE" ? { href: homePathForRole(user.role) } : null;
  return { props: { account, yearBE: new Date().getFullYear() + 543 } };
};

/* TF-46: หน้าแรกสาธารณะ — ยังไม่ได้ทำ */
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
      <header className="sticky top-0 z-50">
        <HotlineBar />
        <Navbar account={account} />
      </header>
      <main className="bg-bg-page flex flex-1 flex-col items-center justify-center px-4 py-24">
        <h1 className="font-heading text-text-primary text-3xl font-bold">น้ำใจไทย SOS</h1>
        <p className="text-text-secondary mt-3 text-base">หน้าแรกอยู่ระหว่างพัฒนา (TF-46)</p>
      </main>
      <FooterContent yearBE={yearBE} />
      <PwaSupport />
    </div>
  );
}
