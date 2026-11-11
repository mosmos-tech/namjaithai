import {
  RESCUE_POLL_INTERVAL_MS,
  RESCUE_REALTIME_CONNECT_TIMEOUT_MS,
  RESCUE_REALTIME_DEBOUNCE_MS,
  canUseRealtime,
  type UserRole,
} from "@/lib/domain";

export type LiveSyncMode = "off" | "connecting" | "realtime" | "polling";
export type LiveSyncReason =
  "unauthorized" | "disabled" | "error" | "timeout" | "closed" | "offline" | null;

export type RealtimeChannelStatus = "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED";

export type RescueLiveStatus = {
  mode: LiveSyncMode;
  reason: LiveSyncReason;
  lastSyncedAt: number | null;
};

export type SubscribeChannelHandlers = {
  onStatus: (status: RealtimeChannelStatus) => void;
  onChange: () => void;
};

export type ChannelSubscription = {
  unsubscribe: () => void;
};

export type RescueLiveSyncOptions = {
  role: UserRole | null | undefined;
  realtimeEnabled?: boolean;
  catchUpOnFirstSubscribe?: boolean;
  subscribeChannel: (handlers: SubscribeChannelHandlers) => ChannelSubscription;
  onRefresh: () => Promise<boolean | void> | boolean | void;
  onStatusChange?: (status: RescueLiveStatus) => void;
  isHidden?: () => boolean;
  pollIntervalMs?: number;
  debounceMs?: number;
  connectTimeoutMs?: number;
};

export type RescueLiveSyncController = {
  start: () => void;
  dispose: () => void;
  getStatus: () => RescueLiveStatus;
  handleStatus: (status: RealtimeChannelStatus) => void;
  handleChange: () => void;
  handleVisibilityChange: (hidden: boolean) => void;
  handleOffline: () => void;
  handleOnline: () => void;
  notifyManualSync: () => void;
};

/**
 * ตัวคุมวงจรชีวิตการอัปเดตข้อมูลเคสฝั่งกู้ภัย/แอดมิน (TF-27)
 * แยก logic บริสุทธิ์ออกมาเพื่อทดสอบได้ครบทุกเงื่อนไขด้วย Vitest fake timers:
 * 1. กั้นสิทธิ์เด็ดขาด: USER / null ไม่เคยเรียก subscribeChannel หรือเริ่ม timer เลย
 * 2. เมื่อ Realtime หลุด/timeout/error/โควตาเต็ม สลับไป poll ทุก 15 วิ (ไม่ถูกรีเซ็ตโดย error ซ้ำจาก reconnect)
 * 3. เมื่อกลับมา SUBSCRIBED หลังเคยหลุด → catch-up รีเฟรชทันทีเพื่อไม่ให้เคสตกหล่น และปิด poll สำรอง
 * 4. หยุด poll ชั่วคราวเมื่อแท็บถูกซ่อน แล้ว catch-up ทันทีเมื่อกลับมาเปิดแท็บ
 */
export function createRescueLiveSyncController(
  options: RescueLiveSyncOptions,
): RescueLiveSyncController {
  const {
    role,
    realtimeEnabled = true,
    catchUpOnFirstSubscribe = false,
    subscribeChannel,
    onRefresh,
    onStatusChange,
    isHidden = () => false,
    pollIntervalMs = RESCUE_POLL_INTERVAL_MS,
    debounceMs = RESCUE_REALTIME_DEBOUNCE_MS,
    connectTimeoutMs = RESCUE_REALTIME_CONNECT_TIMEOUT_MS,
  } = options;

  let status: RescueLiveStatus = { mode: "off", reason: null, lastSyncedAt: null };
  let disposed = false;
  let started = false;
  let needsCatchUp = false;
  let firstSubscription = true;
  let wasHiddenWhileRealtime = false;
  let inFlight = false;
  let rerunQueued = false;

  let subscription: ChannelSubscription | null = null;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingTrailingChange = false;
  let connectTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

  function emit(next: RescueLiveStatus) {
    if (
      status.mode === next.mode &&
      status.reason === next.reason &&
      status.lastSyncedAt === next.lastSyncedAt
    ) {
      return;
    }
    status = next;
    onStatusChange?.(status);
  }

  function setMode(mode: LiveSyncMode, reason: LiveSyncReason) {
    emit({ ...status, mode, reason });
  }

  function clearConnectTimeout() {
    if (connectTimeoutTimer !== null) {
      clearTimeout(connectTimeoutTimer);
      connectTimeoutTimer = null;
    }
  }

  function clearDebounce() {
    pendingTrailingChange = false;
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  function stopPolling() {
    if (pollTimer !== null) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  }

  async function triggerRefresh(): Promise<void> {
    if (disposed) return;
    if (inFlight) {
      rerunQueued = true;
      return;
    }
    inFlight = true;
    pendingTrailingChange = false;
    try {
      const result = await onRefresh();
      if (!disposed && result !== false) {
        emit({ ...status, lastSyncedAt: Date.now() });
      }
    } catch {
      // ปล่อยให้รอบถัดไปลองใหม่โดยไม่ทำลายวงจร poll
    } finally {
      inFlight = false;
      if (rerunQueued && !disposed) {
        rerunQueued = false;
        await triggerRefresh();
      }
    }
  }

  function schedulePollIfNeeded() {
    if (disposed || status.mode !== "polling" || isHidden() || pollTimer !== null) return;
    pollTimer = setTimeout(async () => {
      pollTimer = null;
      await triggerRefresh();
      schedulePollIfNeeded();
    }, pollIntervalMs);
  }

  function enterPolling(reason: Exclude<LiveSyncReason, "unauthorized" | null>) {
    clearConnectTimeout();
    setMode("polling", reason);
    // ไม่ล้าง pollTimer ถ้ากำลังนับถอยหลังอยู่แล้ว (กัน Phoenix error ซ้ำแล้วดันรอบ 15 วิออกไปเรื่อยๆ)
    schedulePollIfNeeded();
  }

  function runImmediatePollingCycle() {
    stopPolling();
    void triggerRefresh().then(() => {
      schedulePollIfNeeded();
    });
  }

  function handleStatus(nextStatus: RealtimeChannelStatus) {
    if (disposed || !started) return;

    if (nextStatus === "SUBSCRIBED") {
      clearConnectTimeout();
      stopPolling();
      const shouldCatchUp = needsCatchUp || (firstSubscription && catchUpOnFirstSubscribe);
      firstSubscription = false;
      needsCatchUp = false;
      setMode("realtime", null);
      if (shouldCatchUp) {
        void triggerRefresh();
      }
      return;
    }

    needsCatchUp = true;
    if (nextStatus === "TIMED_OUT") {
      enterPolling("timeout");
    } else if (nextStatus === "CLOSED") {
      enterPolling("closed");
    } else {
      enterPolling("error");
    }
  }

  function startCooldown() {
    if (debounceMs <= 0) return;
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      if (disposed || !started) {
        pendingTrailingChange = false;
        return;
      }
      if (pendingTrailingChange) {
        pendingTrailingChange = false;
        startCooldown();
        void triggerRefresh();
      }
    }, debounceMs);
  }

  function handleChange() {
    if (disposed || !started || !canUseRealtime(role)) return;
    // leading-edge + cooldown: รอบแรกดึงทันทีโดยไม่ต้องรอ 250ms และรวม event ที่ตามมาติดๆ กัน
    if (debounceTimer !== null) {
      pendingTrailingChange = true;
      return;
    }
    startCooldown();
    void triggerRefresh();
  }

  function handleVisibilityChange(hidden: boolean) {
    if (disposed || !started) return;
    if (hidden) {
      stopPolling();
      if (status.mode === "realtime") {
        wasHiddenWhileRealtime = true;
      }
      return;
    }

    if (status.mode === "polling") {
      runImmediatePollingCycle();
      return;
    }

    if (status.mode === "realtime" && wasHiddenWhileRealtime) {
      wasHiddenWhileRealtime = false;
      void triggerRefresh();
    }
  }

  function handleOffline() {
    if (disposed || !started || !canUseRealtime(role)) return;
    if (!realtimeEnabled) {
      setMode("polling", "disabled");
      return;
    }
    needsCatchUp = true;
    enterPolling("offline");
  }

  function handleOnline() {
    if (disposed || !started || !canUseRealtime(role)) return;
    if (status.mode === "polling") {
      if (realtimeEnabled) needsCatchUp = true;
      runImmediatePollingCycle();
    }
  }

  function notifyManualSync() {
    if (disposed) return;
    emit({ ...status, lastSyncedAt: Date.now() });
    if (status.mode === "polling" && !isHidden()) {
      stopPolling();
      schedulePollIfNeeded();
    }
  }

  function start() {
    if (started || disposed) return;
    started = true;

    if (!canUseRealtime(role)) {
      setMode("off", "unauthorized");
      return;
    }

    if (!realtimeEnabled) {
      enterPolling("disabled");
      return;
    }

    setMode("connecting", null);

    connectTimeoutTimer = setTimeout(() => {
      connectTimeoutTimer = null;
      if (disposed || status.mode === "realtime") return;
      needsCatchUp = true;
      setMode("polling", "timeout");
      runImmediatePollingCycle();
    }, connectTimeoutMs);

    try {
      subscription = subscribeChannel({
        onStatus: handleStatus,
        onChange: handleChange,
      });
    } catch {
      needsCatchUp = true;
      enterPolling("error");
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    clearConnectTimeout();
    clearDebounce();
    stopPolling();
    try {
      subscription?.unsubscribe();
    } catch {
      // ignore cleanup errors
    }
    subscription = null;
  }

  return {
    start,
    dispose,
    getStatus: () => status,
    handleStatus,
    handleChange,
    handleVisibilityChange,
    handleOffline,
    handleOnline,
    notifyManualSync,
  };
}
