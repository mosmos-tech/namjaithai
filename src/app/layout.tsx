import type { Metadata, Viewport } from "next";
import { PwaSupport } from "@/features/pwa/PwaSupport";
import { OfflineSosSupport } from "@/features/sos/components/OfflineSosSupport";
import { Bai_Jamjuree, IBM_Plex_Mono, IBM_Plex_Sans_Thai_Looped } from "next/font/google";
import { EnvBanner } from "@/components/EnvBanner";
import "./globals.css";

const ibmPlexSansThaiLooped = IBM_Plex_Sans_Thai_Looped({
  variable: "--font-sans",
  weight: ["400", "500", "600"],
  preload: false,
});

const baiJamjuree = Bai_Jamjuree({
  variable: "--font-heading",
  weight: ["400", "600", "700"],
  preload: false,
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  weight: ["600", "700"],
  preload: false,
});

export const metadata: Metadata = {
  title: "น้ำใจไทย SOS",
  description: "ระบบขอและประสานความช่วยเหลือในภาวะวิกฤต",
  appleWebApp: { capable: true, title: "น้ำใจไทย SOS", statusBarStyle: "default" },
  icons: { apple: "/pwa/apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: "#1F6FD1" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="th"
      className={`${ibmPlexSansThaiLooped.variable} ${baiJamjuree.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <EnvBanner />
        <OfflineSosSupport />
        {children}
        <PwaSupport />
      </body>
    </html>
  );
}
