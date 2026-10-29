import type { Metadata } from "next";
import { Bai_Jamjuree, IBM_Plex_Mono, IBM_Plex_Sans_Thai_Looped } from "next/font/google";
import "./globals.css";

const ibmPlexSansThaiLooped = IBM_Plex_Sans_Thai_Looped({
  variable: "--font-sans",
  weight: ["400", "500", "600"],
  subsets: ["thai", "latin"],
});

const baiJamjuree = Bai_Jamjuree({
  variable: "--font-heading",
  weight: ["400", "600", "700"],
  subsets: ["thai", "latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  weight: ["600", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "น้ำใจไทย SOS",
  description: "ระบบขอและประสานความช่วยเหลือในภาวะวิกฤต",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="th"
      className={`${ibmPlexSansThaiLooped.variable} ${baiJamjuree.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
