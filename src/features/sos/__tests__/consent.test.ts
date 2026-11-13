import { expect, it, vi } from "vitest";
import { handleCreateSosCase, type SosCaseRpcClient } from "../server/create-case";
import { smsCaseBody } from "../../sms/inbound";
import { SMS_CONSENT_VERSION } from "../../../lib/domain";

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

it("TF-36: SMS records the SMS consent version and channel, web stays on the form version", async () => {
  const rpc = vi.fn<SosCaseRpcClient["rpc"]>().mockResolvedValue({ data: [], error: null });
  const rawBody = smsCaseBody(
    {
      incidentType: "FLOOD",
      lat: 13.75,
      lng: 100.5,
      adults: 1,
      elderly: 0,
      bedridden: 0,
      children: 0,
    },
    "0812345678",
  );
  await handleCreateSosCase({ rawBody, headers: new Headers(), supabase: { rpc }, channel: "SMS" });
  expect(rpc.mock.calls[0][1].p_payload).toMatchObject({
    channel: "SMS",
    consentVersion: SMS_CONSENT_VERSION,
  });

  await handleCreateSosCase({ rawBody, headers: new Headers(), supabase: { rpc } });
  expect(rpc.mock.calls[1][1].p_payload.consentVersion).toBe("2026-11-06");
  expect(rpc.mock.calls[1][1].p_payload).not.toHaveProperty("channel");
});

it("TF-36: the web form cannot claim an SMS location source", async () => {
  const rpc = vi.fn<SosCaseRpcClient["rpc"]>().mockResolvedValue({ data: [], error: null });
  const result = await handleCreateSosCase({
    rawBody: {
      ...smsCaseBody(
        {
          incidentType: "FLOOD",
          lat: 13.75,
          lng: 100.5,
          adults: 1,
          elderly: 0,
          bedridden: 0,
          children: 0,
        },
        "0812345678",
      ),
      locationSource: "SMS",
    },
    headers: new Headers(),
    supabase: { rpc },
  });
  expect(result.status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});
