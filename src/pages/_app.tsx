import { HomeConfirmationLoader } from "@/features/sos/components/HomeConfirmationLoader";
import type { AppProps } from "next/app";
import { OfflineSosHomeSupport } from "@/features/sos/components/OfflineSosHomeSupport";
import "@/app/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <OfflineSosHomeSupport />
      <HomeConfirmationLoader />
      <Component {...pageProps} />
    </>
  );
}
