import { useEffect, useState, type ComponentType } from "react";
/** Only load confirmation UI on the lightweight home page when this device has sent cases. */
export function HomeConfirmationLoader() {
  const [Banner, setBanner] = useState<ComponentType | null>(null);
  useEffect(() => {
    let active = true;
    try {
      const value = JSON.parse(localStorage.getItem("namjaithai:confirmation-cases") ?? "[]");
      if (Array.isArray(value) && value.length)
        void import("./DeviceConfirmationBanner").then(({ DeviceConfirmationBanner }) => {
          if (active) setBanner(() => DeviceConfirmationBanner);
        });
    } catch {
      /* no available local storage */
    }
    return () => {
      active = false;
    };
  }, []);
  return Banner ? <Banner /> : null;
}
