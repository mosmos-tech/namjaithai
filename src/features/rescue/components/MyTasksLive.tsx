"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import type { UserRole } from "@/lib/domain";
import { useRescueCasesLive } from "../use-rescue-cases-live";

/** Refresh the server-rendered TF-26 cards when assignment or status changes. */
export function MyTasksLive({ role }: { role: UserRole }) {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  useRescueCasesLive({ role, onRefresh: refresh, catchUpOnFirstSubscribe: true });
  return null;
}
