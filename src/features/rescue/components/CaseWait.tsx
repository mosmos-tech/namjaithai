"use client";

import { useEffect, useState } from "react";
import { formatWaitDuration, isLongWait } from "@/lib/domain";

export function CaseWait({ createdAt }: { createdAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const elapsed = now - new Date(createdAt).getTime();
  return (
    <p
      data-testid="case-wait"
      className={
        isLongWait(elapsed) ? "font-semibold text-red-600" : "text-text-secondary font-semibold"
      }
    >
      {formatWaitDuration(elapsed)}
    </p>
  );
}
