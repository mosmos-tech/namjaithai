import { expect, it, vi } from "vitest";
import { handleCreateSosCase, type SosCaseRpcClient } from "../server/create-case";

it("rejects a complete SOS when consent is missing", async () => {
  const rpc = vi.fn<SosCaseRpcClient["rpc"]>().mockResolvedValue({ data: [], error: null });
  const result = await handleCreateSosCase({
    rawBody: {
      dangerSigns: [],
      canSelfEvacuate: true,
      lat: 13.75,
      lng: 100.5,
      landmark: "วัด",
      adults: 1,
      elderly: 0,
      bedridden: 0,
      children: 0,
      pets: 0,
      needs: [],
      name: "ผู้แจ้ง",
      phone: "0812345678",
    },
    headers: new Headers(),
    supabase: { rpc },
  });
  expect(result.status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});

it("rejects SOS with health data when health consent is absent", async () => {
  const rpc = vi.fn<SosCaseRpcClient["rpc"]>().mockResolvedValue({ data: [], error: null });
  const result = await handleCreateSosCase({
    rawBody: {
      dangerSigns: [],
      canSelfEvacuate: true,
      lat: 13.75,
      lng: 100.5,
      landmark: "วัด",
      adults: 1,
      elderly: 0,
      bedridden: 0,
      children: 0,
      pets: 0,
      hasInjured: true,
      needs: [],
      name: "ผู้แจ้ง",
      phone: "0812345678",
      consent: true,
    },
    headers: new Headers(),
    supabase: { rpc },
  });
  expect(result.status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});
