import type { SVGProps } from "react";

function WaterDropHeart(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
      {/* หยดน้ำ — สี primary-600 */}
      <path
        d="M16 3C15.4 3.6 7 12.2 7 19C7 24.5 11 29 16 29C21 29 25 24.5 25 19C25 12.2 16.6 3 16 3Z"
        fill="var(--color-primary-600)"
      />
      {/* หัวใจ — สีขาว */}
      <path
        d="M16 24L10.5 18.8C9.2 17.5 9.7 15.2 11.5 14.6C12.5 14.3 13.6 14.7 14.3 15.6L16 17.5L17.7 15.6C18.4 14.7 19.5 14.3 20.5 14.6C22.3 15.2 22.8 17.5 21.5 18.8L16 24Z"
        fill="white"
      />
    </svg>
  );
}

interface LogoProps {
  /** sm = footer; default = navbar */
  size?: "default" | "sm";
}

export function Logo({ size = "default" }: LogoProps) {
  const iconSize = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const nameSize = size === "sm" ? "text-base" : "text-xl";

  return (
    <div className="flex items-center gap-2.5">
      <WaterDropHeart className={`shrink-0 ${iconSize}`} />
      <div>
        <div className="flex items-center gap-1.5">
          <span className={`font-heading font-bold leading-tight text-text-primary ${nameSize}`}>
            น้ำใจไทย
          </span>
          <span className="rounded bg-red-600 px-1.5 py-0.5 font-heading text-xs font-bold leading-none text-white">
            SOS
          </span>
        </div>
        <p className="mt-px text-xs leading-tight text-text-secondary">
          ศูนย์ประสานงานช่วยเหลือน้ำท่วม
        </p>
      </div>
    </div>
  );
}
