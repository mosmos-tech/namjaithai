import { Footer } from "@/components/public/Footer";
import { HotlineBar } from "@/components/public/HotlineBar";
import { Navbar } from "@/components/public/Navbar";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-50">
        <HotlineBar />
        <Navbar />
      </header>
      <main className="flex-1 bg-bg-page">{children}</main>
      <Footer />
    </>
  );
}
