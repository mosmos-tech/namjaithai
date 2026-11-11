"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canUseRealtime, isRealtimeEnabled, type UserRole } from "@/lib/domain";
import { createClient } from "@/lib/supabase/client";
import {
  createRescueLiveSyncController,
  type RealtimeChannelStatus,
  type RescueLiveStatus,
  type RescueLiveSyncController,
} from "./live-sync";

function mapChannelStatus(status: string): RealtimeChannelStatus | null {
  if (
    status === "SUBSCRIBED" ||
    status === "CHANNEL_ERROR" ||
    status === "TIMED_OUT" ||
    status === "CLOSED"
  ) {
    return status;
  }
  return null;
}

export type UseRescueCasesLiveOptions = {
  role: UserRole | null | undefined;
  enabled?: boolean;
  supabase?: SupabaseClient;
  onRefresh: () => Promise<boolean | void> | boolean | void;
  realtimeEnabled?: boolean;
  catchUpOnFirstSubscribe?: boolean;
  /**
   * TF-28: ฟังตำแหน่งทีม (rescuer_locations) ในช่องเดียวกันด้วย — ไม่เปิดช่องใหม่
   * เรียกเมื่อมีคนในจังหวัดอัปเดต/หยุดแชร์ ให้หน้าเว็บดึงทั้งชุดใหม่ (Realtime ส่งตาม RLS)
   */
  onTeamLocationsChange?: () => void;
};

/**
 * React hook สำหรับซิงค์ข้อมูลเคสฝั่งกู้ภัย/แอดมินแบบเรียลไทม์ (TF-27)
 * - เปิด Supabase Realtime (`postgres_changes` บน `public.cases`) เฉพาะ `RESCUER`, `UNIT_LEAD`, `ADMIN`
 * - ถ้า Realtime หลุด/timeout/โควตาเต็ม จะสลับไป poll ทุก 15 วินาที และ catch-up ทันทีเมื่อกลับมา SUBSCRIBED
 * - ใช้หัวข้อ channel ใหม่ทุกครั้งที่ subscribe เพื่อเลี่ยงปัญหา channel ค้างเมื่อ React StrictMode remount
 */
export function useRescueCasesLive({
  role,
  enabled = true,
  supabase: providedClient,
  onRefresh,
  realtimeEnabled = isRealtimeEnabled(),
  catchUpOnFirstSubscribe = false,
  onTeamLocationsChange,
}: UseRescueCasesLiveOptions): RescueLiveStatus & { notifyManualSync: () => void } {
  const allowed = canUseRealtime(role);
  const active = enabled && allowed;
  const instanceId = useId();
  const channelSeqRef = useRef(0);
  const controllerRef = useRef<RescueLiveSyncController | null>(null);
  const onRefreshRef = useRef(onRefresh);
  const onTeamRef = useRef(onTeamLocationsChange);
  const listenTeam = onTeamLocationsChange !== undefined;

  const [status, setStatus] = useState<RescueLiveStatus>(() => ({
    mode: !allowed ? "off" : realtimeEnabled ? "connecting" : "polling",
    reason: !allowed ? "unauthorized" : realtimeEnabled ? null : "disabled",
    lastSyncedAt: null,
  }));

  useEffect(() => {
    onRefreshRef.current = onRefresh;
    onTeamRef.current = onTeamLocationsChange;
  }, [onRefresh, onTeamLocationsChange]);

  useEffect(() => {
    if (!active) {
      return;
    }

    const client = providedClient ?? createClient();
    const controller = createRescueLiveSyncController({
      role,
      realtimeEnabled,
      catchUpOnFirstSubscribe,
      isHidden: () => (typeof document !== "undefined" ? document.hidden : false),
      onRefresh: () => onRefreshRef.current(),
      onStatusChange: (next) => setStatus(next),
      subscribeChannel: (handlers) => {
        const topic = `rescue-cases-${instanceId.replace(/[^a-zA-Z0-9_-]/g, "")}-${++channelSeqRef.current}`;
        const channel = client
          .channel(topic, {
            config: {
              postgres_changes_options: { wait: true },
            },
          })
          .on("postgres_changes", { event: "*", schema: "public", table: "cases" }, () => {
            handlers.onChange();
          });
        if (listenTeam) {
          channel.on(
            "postgres_changes",
            { event: "*", schema: "public", table: "rescuer_locations" },
            () => onTeamRef.current?.(),
          );
        }
        channel.subscribe((next) => {
          const mapped = mapChannelStatus(next);
          if (mapped) handlers.onStatus(mapped);
        });

        return {
          unsubscribe: () => {
            void client.removeChannel(channel);
          },
        };
      },
    });

    controllerRef.current = controller;
    controller.start();

    const onVisibility = () => controller.handleVisibilityChange(document.hidden);
    const onOffline = () => controller.handleOffline();
    const onOnline = () => controller.handleOnline();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      controller.dispose();
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    };
  }, [
    active,
    catchUpOnFirstSubscribe,
    instanceId,
    listenTeam,
    providedClient,
    realtimeEnabled,
    role,
  ]);

  const notifyManualSync = useCallback(() => {
    controllerRef.current?.notifyManualSync();
  }, []);

  if (!allowed) {
    return {
      mode: "off",
      reason: "unauthorized",
      lastSyncedAt: null,
      notifyManualSync,
    };
  }

  return {
    ...status,
    notifyManualSync,
  };
}
