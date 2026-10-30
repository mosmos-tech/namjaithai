"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * วงกลมติ๊กถูกกลางจอ หน้าส่งสำเร็จ
 * - เล่นแอนิเมชันด้วย JS (Web Animations API) ครั้งเดียวตอนเปิดหน้า ไม่วนซ้ำ:
 *   วงกลมขยายเข้ามา แล้วลากเส้นติ๊กถูก
 * - ไม่เล่นเลยถ้าเครื่องตั้ง "ลดการเคลื่อนไหว" (prefers-reduced-motion) แสดงติ๊กถูกเต็มทันที
 * ใช้ useLayoutEffect เพื่อตั้งท่าเริ่มต้นก่อนเบราว์เซอร์วาด จะได้ไม่เห็นติ๊กถูกเต็มแวบหนึ่งก่อนเล่น
 */
export function SuccessCheck() {
  const circleRef = useRef<HTMLDivElement>(null);
  const checkRef = useRef<SVGPathElement>(null);

  useLayoutEffect(() => {
    const circle = circleRef.current;
    const check = checkRef.current;
    if (!circle || !check) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const pop = circle.animate(
      [
        { transform: "scale(0.6)", opacity: 0 },
        { transform: "scale(1.06)", opacity: 1, offset: 0.7 },
        { transform: "scale(1)", opacity: 1 },
      ],
      { duration: 420, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "backwards" },
    );
    // pathLength=1 ทำให้ dashoffset 1 → 0 คือวาดเส้นจากไม่มีเลยจนเต็ม
    const draw = check.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], {
      duration: 380,
      delay: 300,
      easing: "ease-out",
      fill: "backwards",
    });
    return () => {
      pop.cancel();
      draw.cancel();
    };
  }, []);

  return (
    <div
      ref={circleRef}
      className="mx-auto flex size-24 items-center justify-center rounded-full border-[3px] border-green-700 bg-green-50 sm:size-28"
    >
      <svg viewBox="0 0 48 48" className="size-12 sm:size-14" aria-hidden="true">
        <path
          ref={checkRef}
          d="M12 25l8 8 16-17"
          fill="none"
          stroke="var(--color-green-700)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
        />
      </svg>
    </div>
  );
}
