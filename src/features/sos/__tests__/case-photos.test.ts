import { describe, expect, it, vi } from "vitest";
import { parseCasePhotos, photoFingerprint, saveCasePhotos } from "../server/case-photos";
import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";

async function validJpeg() {
  const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } })
    .jpeg()
    .toBuffer();
  return `data:image/jpeg;base64,${bytes.toString("base64")}`;
}

describe("SOS photos", () => {
  it("validates the actual contents and byte limit before submission", async () => {
    const jpeg = await validJpeg();
    const photos = await parseCasePhotos([jpeg]);
    expect(photos[0].bytes.length).toBeGreaterThan(4);
    await expect(parseCasePhotos(Array(4).fill(jpeg))).rejects.toThrow();
    await expect(parseCasePhotos(["data:image/jpeg;base64,AAAA"])).rejects.toThrow();
    await expect(
      parseCasePhotos([
        `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64")}`,
      ]),
    ).rejects.toThrow();
    await expect(
      parseCasePhotos([`data:image/jpeg;base64,${Buffer.alloc(512001).toString("base64")}`]),
    ).rejects.toThrow();
    expect(photoFingerprint(photos)).toBe(photoFingerprint(await parseCasePhotos([jpeg])));
  });
  it("reuses an already uploaded object after a lost response", async () => {
    const upload = vi.fn().mockResolvedValue({ error: { message: "exists" } });
    const exists = vi.fn().mockResolvedValue({ data: true, error: null });
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const client = {
      rpc,
      storage: { from: () => ({ upload, exists }) },
    } as unknown as SupabaseClient;
    expect(
      await saveCasePhotos(client, "case-id", await parseCasePhotos([await validJpeg()])),
    ).toBe("ok");
    expect(rpc).toHaveBeenCalledOnce();
    expect(exists).toHaveBeenCalledOnce();
  });
});
