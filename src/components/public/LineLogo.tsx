/* eslint-disable @next/next/no-img-element -- SVG เล็กจาก Figma ไม่ต้องผ่าน next/image */

// โลโก้ LINE (Figma: Logo/LINE) ฟองคำพูดสีขาว + ตัวอักษร LINE สีเขียว ใช้บนปุ่มเขียว LINE เท่านั้น
// ขนาดตั้งต้น 28px ตาม Figma ปรับได้ด้วย className (ทุกส่วนวัดเป็นสัดส่วนของกล่อง)
export function LineLogo({ className = "size-7" }: { className?: string }) {
  return (
    <span
      className={`[container-type:inline-size] relative inline-block shrink-0 ${className}`}
      aria-hidden="true"
    >
      <img
        src="/brand/line-bubble.svg"
        alt=""
        className="absolute top-0 left-0 h-[80.36%] w-[85.71%] max-w-none"
      />
      <span className="font-heading text-line-green absolute top-[28.9%] left-1/2 -translate-x-1/2 text-[25cqw] leading-none font-bold whitespace-nowrap">
        LINE
      </span>
    </span>
  );
}
