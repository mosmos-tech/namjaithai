import { HotlineBar } from "@/components/public/HotlineBar";
import { NavbarWithAccount } from "@/features/auth/components/NavbarWithAccount";
import { HomeConfirmationLoader } from "@/features/sos/components/HomeConfirmationLoader";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-50">
        <HotlineBar />
        <NavbarWithAccount />
      </header>
      <HomeConfirmationLoader />
      <main className="bg-bg-page flex-1">{children}</main>
    </>
  );
}
