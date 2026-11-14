"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

export default function NavbarPath({ onChange }: { onChange: (pathname: string | null) => void }) {
  const pathname = usePathname();
  useEffect(() => onChange(pathname), [onChange, pathname]);
  return null;
}
