"use client";

import { useEffect, useState, type ComponentType } from "react";

/** Only load confirmation bar UI when this device has stored case references. */
export function HomeConfirmationLoader() {
  const [Banner, setBanner] = useState<ComponentType | null>(null);

  useEffect(() => {
    let active = true;
    const EV = ["namjaithai:device-cases", "storage"] as const;

    const check = () => {
      try {
        const raw = localStorage.getItem("namjaithai:confirmation-cases");
        const parsed = raw ? JSON.parse(raw) : null;
        if (Array.isArray(parsed) && parsed.length > 0) {
          void import("./DeviceConfirmationBanner").then((m) => {
            if (active) setBanner(() => m.DeviceConfirmationBanner);
          });
        }
      } catch {}
    };

    check();
    EV.forEach((e) => window.addEventListener(e, check));
    return () => {
      active = false;
      EV.forEach((e) => window.removeEventListener(e, check));
    };
  }, []);

  return Banner ? <Banner /> : null;
}
