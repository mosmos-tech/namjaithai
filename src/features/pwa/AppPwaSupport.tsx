"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { PwaSupport, type PwaText } from "./PwaSupport";

export const ENGLISH_PWA_TEXT: PwaText = {
  offlineStatus:
    "Offline: You can fill out and save an SOS request on this device. It will be sent automatically when you are back online. For urgent help, call 1669 / 1784.",
  bannerAriaLabel: "Add to Home Screen",
  title: "Add Namjai Thai to your Home Screen",
  iosSubtitle: "For quick access and to help prevent iPhone from clearing your saved data",
  defaultSubtitle: "Open the SOS form, hotlines, and survival guide quickly like an app",
  iosInstallButton: "How to add",
  defaultInstallButton: "Add to Home Screen",
  dismissAriaLabel: "Dismiss add to home screen banner",
  dismissButton: "Not now",
  iosFigureAriaLabel: "Share button, Add to Home Screen menu, and Add button in Safari",
  iosSvgAddText: "Add",
  iosCaption: "On iPhone: Open in Safari, tap the Share button → “Add to Home Screen” → “Add”",
  readyStatus: "Offline ready: SOS form, hotlines, and survival guide available offline",
};

function PwaSupportByPath() {
  const pathname = usePathname();
  const isEnglish = pathname === "/en" || Boolean(pathname?.startsWith("/en/"));
  return <PwaSupport text={isEnglish ? ENGLISH_PWA_TEXT : undefined} />;
}

export function AppPwaSupport() {
  return (
    <Suspense fallback={null}>
      <PwaSupportByPath />
    </Suspense>
  );
}
