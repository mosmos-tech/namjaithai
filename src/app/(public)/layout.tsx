import { HotlineBar } from "@/components/public/HotlineBar";
import { NavbarWithAccount } from "@/features/auth/components/NavbarWithAccount";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-50">
        <HotlineBar />
        <NavbarWithAccount />
      </header>
      <main className="bg-bg-page flex-1">{children}</main>
    </>
  );
}
