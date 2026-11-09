import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserRole } from "@/lib/domain";
import {
  createRescueLiveSyncController,
  type RescueLiveStatus,
  type SubscribeChannelHandlers,
} from "../live-sync";

function setupController(overrides?: {
  role?: UserRole | null;
  realtimeEnabled?: boolean;
  onRefresh?: () => Promise<boolean | void> | boolean | void;
  subscribeThrows?: boolean;
  hidden?: { value: boolean };
  pollIntervalMs?: number;
  debounceMs?: number;
  connectTimeoutMs?: number;
}) {
  let handlers: SubscribeChannelHandlers | null = null;
  const subscribeCount = { calls: 0, unsubscribes: 0 };
  const statuses: RescueLiveStatus[] = [];

  const subscribeChannel = vi.fn((h: SubscribeChannelHandlers) => {
    subscribeCount.calls++;
    if (overrides?.subscribeThrows) {
      throw new Error("WebSocket unavailable");
    }
    handlers = h;
    return {
      unsubscribe: () => {
        subscribeCount.unsubscribes++;
      },
    };
  });

  const onRefresh = vi.fn(overrides?.onRefresh ?? (async () => true));
  const hiddenState = overrides?.hidden ?? { value: false };

  const controller = createRescueLiveSyncController({
    role: "role" in (overrides ?? {}) ? overrides!.role : UserRole.RESCUER,
    realtimeEnabled: overrides?.realtimeEnabled ?? true,
    subscribeChannel,
    onRefresh,
    onStatusChange: (s) => statuses.push(s),
    isHidden: () => hiddenState.value,
    pollIntervalMs: overrides?.pollIntervalMs ?? 15_000,
    debounceMs: overrides?.debounceMs ?? 250,
    connectTimeoutMs: overrides?.connectTimeoutMs ?? 15_000,
  });

  return {
    controller,
    subscribeChannel,
    subscribeCount,
    onRefresh,
    statuses,
    hiddenState,
    emitStatus: (status: "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED") => {
      if (!handlers) throw new Error("Channel not subscribed");
      handlers.onStatus(status);
    },
    emitChange: () => {
      if (!handlers) throw new Error("Channel not subscribed");
      handlers.onChange();
    },
  };
}

describe("TF-27 createRescueLiveSyncController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ผู้แจ้ง (USER) และผู้ไม่ล็อกอิน (null) ไม่เปิดการเชื่อมต่อ Realtime และไม่ poll เลย", () => {
    for (const role of [UserRole.USER, null, undefined] as const) {
      const ctx = setupController({ role });
      ctx.controller.start();
      vi.advanceTimersByTime(60_000);
      expect(ctx.subscribeChannel).not.toHaveBeenCalled();
      expect(ctx.onRefresh).not.toHaveBeenCalled();
      expect(ctx.controller.getStatus().mode).toBe("off");
      expect(ctx.controller.getStatus().reason).toBe("unauthorized");
      ctx.controller.dispose();
    }
  });

  it.each([UserRole.RESCUER, UserRole.UNIT_LEAD, UserRole.ADMIN])(
    "บทบาท %s เชื่อมต่อ Realtime, รีเฟรชทันทีใน 0ms และรวม event ซ้ำภายใน cooldown 250ms",
    async (role) => {
      const ctx = setupController({ role });
      ctx.controller.start();

      expect(ctx.subscribeChannel).toHaveBeenCalledTimes(1);
      expect(ctx.controller.getStatus().mode).toBe("connecting");

      ctx.emitStatus("SUBSCRIBED");
      expect(ctx.controller.getStatus().mode).toBe("realtime");
      expect(ctx.onRefresh).not.toHaveBeenCalled();

      // event แรกดึงทันทีใน 0ms; event ถัดไปภายใน 250ms จะถูกรวมเป็น 1 รอบเมื่อครบ cooldown
      ctx.emitChange();
      await vi.advanceTimersByTimeAsync(0);
      expect(ctx.onRefresh).toHaveBeenCalledTimes(1);

      ctx.emitChange();
      ctx.emitChange();

      await vi.advanceTimersByTimeAsync(249);
      expect(ctx.onRefresh).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(ctx.onRefresh).toHaveBeenCalledTimes(2);

      ctx.controller.dispose();
      expect(ctx.subscribeCount.unsubscribes).toBe(1);
    },
  );

  it("รวมคำขอซ้ำหากมี event ใหม่เข้ามาขณะกำลังรีเฟรชอยู่ (in-flight coalescing)", async () => {
    let resolveFirst!: () => void;
    const firstPromise = new Promise<boolean>((resolve) => {
      resolveFirst = () => resolve(true);
    });
    let call = 0;
    const ctx = setupController({
      onRefresh: () => {
        call++;
        return call === 1 ? firstPromise : Promise.resolve(true);
      },
    });
    ctx.controller.start();
    ctx.emitStatus("SUBSCRIBED");

    ctx.emitChange();
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.onRefresh).toHaveBeenCalledTimes(1);

    // รอพ้น cooldown 250ms แล้วมี event เข้ามาอีก 2 ครั้งติดกันระหว่างที่รอบแรกยังโหลดไม่เสร็จ
    await vi.advanceTimersByTimeAsync(250);
    ctx.emitChange();
    ctx.emitChange();
    await vi.advanceTimersByTimeAsync(250);
    // ยังต้องรอให้รอบแรกเสร็จก่อน และคำขอระหว่างโหลดต้องถูกรวมไม่ซ้ำซ้อน
    expect(ctx.onRefresh).toHaveBeenCalledTimes(1);

    resolveFirst();
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.onRefresh).toHaveBeenCalledTimes(2);

    ctx.controller.dispose();
  });

  it("เมื่อ Realtime หลุด (CHANNEL_ERROR / TIMED_OUT / CLOSED) จะสลับไปดึงข้อมูลทุก 15 วินาที และไม่รีเซ็ตตัวนับหาก error ซ้ำ", async () => {
    const ctx = setupController();
    ctx.controller.start();
    ctx.emitStatus("SUBSCRIBED");

    ctx.emitStatus("CHANNEL_ERROR");
    expect(ctx.controller.getStatus()).toMatchObject({ mode: "polling", reason: "error" });

    // จำลอง Phoenix reconnect ล้มเหลวซ้ำที่วินาที 3 และ 7 — ห้ามดันรอบ 15 วิออกไปเรื่อยๆ
    await vi.advanceTimersByTimeAsync(3_000);
    ctx.emitStatus("CHANNEL_ERROR");
    await vi.advanceTimersByTimeAsync(4_000);
    ctx.emitStatus("TIMED_OUT");
    expect(ctx.onRefresh).not.toHaveBeenCalled();

    // ครบ 15,000ms จากตอนหลุดครั้งแรก → ต้องยิงรอบที่ 1
    await vi.advanceTimersByTimeAsync(8_000);
    expect(ctx.onRefresh).toHaveBeenCalledTimes(1);

    // รอบที่ 2 ที่วินาทีที่ 30
    await vi.advanceTimersByTimeAsync(15_000);
    expect(ctx.onRefresh).toHaveBeenCalledTimes(2);

    ctx.controller.dispose();
  });

  it("กลับมาเชื่อมต่อ Realtime (SUBSCRIBED หลังหลุด) แล้ว catch-up ทันทีไม่ตกหล่นเคส และหยุด poll สำรอง", async () => {
    const ctx = setupController();
    ctx.controller.start();
    ctx.emitStatus("SUBSCRIBED");
    expect(ctx.onRefresh).not.toHaveBeenCalled();

    // ตัดการเชื่อมต่อ
    ctx.emitStatus("CLOSED");
    expect(ctx.controller.getStatus().mode).toBe("polling");

    // กลับมาเชื่อมต่ออีกครั้ง → ต้องรีเฟรช catch-up ทันทีโดยไม่ต้องรอครบ 15 วิ
    ctx.emitStatus("SUBSCRIBED");
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.controller.getStatus()).toMatchObject({ mode: "realtime", reason: null });
    expect(ctx.onRefresh).toHaveBeenCalledTimes(1);

    // หลังกลับมาเป็น realtime แล้ว ห้ามมี timer poll ทุก 15 วิอีก
    await vi.advanceTimersByTimeAsync(45_000);
    expect(ctx.onRefresh).toHaveBeenCalledTimes(1);

    ctx.controller.dispose();
  });

  it("หากเชื่อมต่อครั้งแรกไม่สำเร็จ (subscribe throw หรือค้าง timeout) ให้สลับไป poll 15 วิ และ catch-up เมื่อ SUBSCRIBED ภายหลัง", async () => {
    // กรณี throw ทันที
    const throwingCtx = setupController({ subscribeThrows: true });
    throwingCtx.controller.start();
    expect(throwingCtx.controller.getStatus()).toMatchObject({ mode: "polling", reason: "error" });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(throwingCtx.onRefresh).toHaveBeenCalledTimes(1);
    throwingCtx.controller.dispose();

    // กรณีค้างในสถานะ connecting เกิน connectTimeoutMs
    const hangCtx = setupController({ connectTimeoutMs: 15_000 });
    hangCtx.controller.start();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(hangCtx.controller.getStatus()).toMatchObject({ mode: "polling", reason: "timeout" });
    expect(hangCtx.onRefresh).toHaveBeenCalledTimes(1);

    // ถ้า Realtime เพิ่งเชื่อมต่อได้ภายหลัง → catch-up ทันที
    hangCtx.emitStatus("SUBSCRIBED");
    await vi.advanceTimersByTimeAsync(0);
    expect(hangCtx.controller.getStatus().mode).toBe("realtime");
    expect(hangCtx.onRefresh).toHaveBeenCalledTimes(2);
    hangCtx.controller.dispose();
  });

  it("ปิด Realtime ทั้งระบบ (realtimeEnabled = false) ไม่เปิด WebSocket แต่ยัง poll ทุก 15 วินาที", async () => {
    const ctx = setupController({ realtimeEnabled: false });
    ctx.controller.start();

    expect(ctx.subscribeChannel).not.toHaveBeenCalled();
    expect(ctx.controller.getStatus()).toMatchObject({ mode: "polling", reason: "disabled" });

    await vi.advanceTimersByTimeAsync(15_000);
    expect(ctx.onRefresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(ctx.onRefresh).toHaveBeenCalledTimes(2);

    ctx.controller.dispose();
  });

  it("หยุด poll ชั่วคราวเมื่อแท็บถูกซ่อน และดึงข้อมูล catch-up ทันทีเมื่อกลับมาเปิดแท็บ", async () => {
    const hidden = { value: false };
    const ctx = setupController({ realtimeEnabled: false, hidden });
    ctx.controller.start();

    // ซ่อนแท็บ → ห้ามยิง poll เปลืองโควตา/แบต
    hidden.value = true;
    ctx.controller.handleVisibilityChange(true);
    await vi.advanceTimersByTimeAsync(45_000);
    expect(ctx.onRefresh).toHaveBeenCalledTimes(0);

    // เปิดแท็บกลับมา → ดึงทันที 1 ครั้ง แล้วเดินรอบ 15 วิต่อ
    hidden.value = false;
    ctx.controller.handleVisibilityChange(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.onRefresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(ctx.onRefresh).toHaveBeenCalledTimes(2);

    ctx.controller.dispose();
  });

  it("เบราว์เซอร์ offline/online สลับโหมดสำรอง 15 วิ และ catch-up เมื่อออนไลน์กลับมา", async () => {
    const ctx = setupController();
    ctx.controller.start();
    ctx.emitStatus("SUBSCRIBED");

    ctx.controller.handleOffline();
    expect(ctx.controller.getStatus()).toMatchObject({ mode: "polling", reason: "offline" });

    ctx.controller.handleOnline();
    await vi.advanceTimersByTimeAsync(0);
    // เมื่อออนไลน์และอยู่ในโหมดสำรอง ดึงทันที 1 ครั้งระหว่างรอ socket rejoin
    expect(ctx.onRefresh).toHaveBeenCalledTimes(1);

    // และเมื่อ socket rejoin สำเร็จ ก็ไม่พลาดเคส
    ctx.emitStatus("SUBSCRIBED");
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.controller.getStatus().mode).toBe("realtime");
    expect(ctx.onRefresh).toHaveBeenCalledTimes(2);

    ctx.controller.dispose();
  });

  it("ซ่อนแท็บระหว่างอยู่ในโหมด realtime เมื่อกลับมาเปิดแท็บต้อง catch-up ทันที และรีเซ็ตตัวนับ poll หลังรีเฟรชเอง", async () => {
    const ctx = setupController();
    ctx.controller.start();
    ctx.emitStatus("SUBSCRIBED");

    ctx.controller.handleVisibilityChange(true);
    ctx.controller.handleVisibilityChange(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.onRefresh).toHaveBeenCalledTimes(1);

    // เข้าโหมด polling แล้วกดรีเฟรชเองตอนผ่านไป 10 วินาที → ตัวนับ 15 วินาทีต้องเริ่มใหม่จากจุดที่กด
    ctx.emitStatus("CLOSED");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(ctx.onRefresh).toHaveBeenCalledTimes(1);
    ctx.controller.notifyManualSync();

    await vi.advanceTimersByTimeAsync(6_000);
    expect(ctx.onRefresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(9_000);
    expect(ctx.onRefresh).toHaveBeenCalledTimes(2);

    ctx.controller.dispose();
  });
});
