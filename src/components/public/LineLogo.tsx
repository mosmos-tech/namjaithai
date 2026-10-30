import type { SVGProps } from "react";

// โลโก้ LINE แบบขาวบนปุ่มเขียว (ฟองคำพูด + ตัวอักษร LINE) ใช้กับปุ่มแชร์/ล็อกอิน LINE
export function LineLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fill="#fff"
        d="M12 2.5C6.2 2.5 1.5 6.3 1.5 11c0 4.2 3.7 7.7 8.8 8.4.3.1.8.2.9.5.1.3.1.7 0 1l-.1.9c0 .3-.2 1 .9.5 1.1-.5 5.9-3.5 8.1-6 1.5-1.6 2.3-3.3 2.3-5.3 0-4.7-4.7-8.5-10.4-8.5Z"
      />
      <path
        fill="var(--color-line-green)"
        d="M7.6 13.6H5.5a.5.5 0 0 1-.5-.5V9a.5.5 0 0 1 1 0v3.6h1.6a.5.5 0 0 1 0 1Zm1.7-.5a.5.5 0 0 1-1 0V9a.5.5 0 0 1 1 0v4.1Zm4.6 0a.5.5 0 0 1-.9.3l-2-2.8v2.5a.5.5 0 0 1-1 0V9a.5.5 0 0 1 .9-.3l2 2.8V9a.5.5 0 0 1 1 0v4.1Zm3.3-2.6a.5.5 0 0 1 0 1h-1.4v1.1h1.4a.5.5 0 0 1 0 1h-1.9a.5.5 0 0 1-.5-.5V9a.5.5 0 0 1 .5-.5h1.9a.5.5 0 0 1 0 1h-1.4v1h1.4Z"
      />
    </svg>
  );
}
