import { describe, expect, it, vi } from "vitest";
import { runMediaRetention, type MediaRetentionClient } from "../media-worker";

describe("ลบรูปเคสที่ครบกำหนด", () => {
  it("ลบผ่าน Storage API ก่อนยืนยันและไม่เปิดเผย path ในผลลัพธ์", async () => {
    const rpc = vi
      .fn<MediaRetentionClient["rpc"]>()
      .mockResolvedValueOnce({
        data: [{ id: "item", storage_path: "private/file.jpg", lease_id: "lease" }],
        error: null,
      })
      .mockResolvedValueOnce({ data: true, error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });
    const result = await runMediaRetention({ rpc, remove });
    expect(remove).toHaveBeenCalledWith(["private/file.jpg"]);
    expect(rpc).toHaveBeenLastCalledWith("finish_case_media_deletion", {
      p_id: "item",
      p_lease_id: "lease",
      p_success: true,
    });
    expect(result).toEqual({ status: 200, claimed: 1, deleted: 1, failed: 0 });
    expect(JSON.stringify(result)).not.toContain("private/file.jpg");
  });

  it("เก็บคิวให้ลองใหม่เมื่อ Storage ล้มเหลว", async () => {
    const rpc = vi
      .fn<MediaRetentionClient["rpc"]>()
      .mockResolvedValueOnce({
        data: [{ id: "item", storage_path: "private/file.jpg", lease_id: "lease" }],
        error: null,
      })
      .mockResolvedValueOnce({ data: true, error: null });
    const result = await runMediaRetention({
      rpc,
      remove: vi.fn().mockResolvedValue({ error: new Error("failed") }),
    });
    expect(rpc).toHaveBeenLastCalledWith("finish_case_media_deletion", {
      p_id: "item",
      p_lease_id: "lease",
      p_success: false,
    });
    expect(result).toEqual({ status: 503, claimed: 1, deleted: 0, failed: 1 });
  });

  it("รายงานล้มเหลวถ้ายืนยันผลไม่ได้ เพื่อให้ lease หมดเวลาแล้วลองใหม่", async () => {
    const rpc = vi
      .fn<MediaRetentionClient["rpc"]>()
      .mockResolvedValueOnce({
        data: [{ id: "item", storage_path: "private/file.jpg", lease_id: "lease" }],
        error: null,
      })
      .mockResolvedValueOnce({ data: false, error: null });
    const result = await runMediaRetention({
      rpc,
      remove: vi.fn().mockResolvedValue({ error: null }),
    });
    expect(result).toEqual({ status: 503, claimed: 1, deleted: 0, failed: 1 });
  });

  it("ไม่เรียก Storage ถ้ารับคิวไม่สำเร็จ", async () => {
    const remove = vi.fn();
    const result = await runMediaRetention({
      rpc: vi.fn().mockResolvedValue({ data: null, error: new Error("unavailable") }),
      remove,
    });
    expect(remove).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 503, claimed: 0, deleted: 0, failed: 1 });
  });

  it("ไม่เรียก Storage ถ้าไม่มีคิวที่รับได้ (เช่น ว่างหรือครบเพดาน retry แล้ว)", async () => {
    const remove = vi.fn();
    const result = await runMediaRetention({
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
      remove,
    });
    expect(remove).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 200, claimed: 0, deleted: 0, failed: 0 });
  });

  it("ปฏิเสธ path ว่างโดยไม่เรียก Storage และคืนคิวให้ยืนยันความล้มเหลว", async () => {
    const rpc = vi
      .fn<MediaRetentionClient["rpc"]>()
      .mockResolvedValueOnce({
        data: [{ id: "item", storage_path: "   ", lease_id: "lease" }],
        error: null,
      })
      .mockResolvedValueOnce({ data: true, error: null });
    const remove = vi.fn();
    const result = await runMediaRetention({ rpc, remove });
    expect(remove).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenLastCalledWith("finish_case_media_deletion", {
      p_id: "item",
      p_lease_id: "lease",
      p_success: false,
    });
    expect(result).toEqual({ status: 503, claimed: 1, deleted: 0, failed: 1 });
  });

  it("แจ้งเตือนใน log เมื่อการลบล้มเหลวโดยไม่เปิดเผย storage_path", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const rpc = vi
        .fn<MediaRetentionClient["rpc"]>()
        .mockResolvedValueOnce({
          data: [{ id: "item-log-check", storage_path: "secret-case/file.jpg", lease_id: "lease" }],
          error: null,
        })
        .mockResolvedValueOnce({ data: true, error: null });
      const result = await runMediaRetention({
        rpc,
        remove: vi.fn().mockResolvedValue({ error: new Error("storage down") }),
      });
      expect(result).toEqual({ status: 503, claimed: 1, deleted: 0, failed: 1 });
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const logged = errorSpy.mock.calls.flat().join(" ");
      expect(logged).toContain("item-log-check");
      expect(logged).not.toContain("secret-case/file.jpg");
    } finally {
      errorSpy.mockRestore();
    }
  });
});
