import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const getClaims = vi.fn();
vi.mock("@/lib/supabase/proxy", () => ({
  createProxyClient: () => ({
    supabase: { auth: { getClaims } },
    getResponse: () => {
      const response = NextResponse.next();
      response.cookies.set("tf75-refreshed", "renewed", { httpOnly: true });
      return response;
    },
  }),
}));
import { proxy } from "../proxy";

beforeEach(() => getClaims.mockResolvedValue({ data: null }));

it("ส่งต่อ cookie session ที่ต่ออายุแล้วใน redirect เลือกภาษา", async () => {
  const request = new NextRequest("http://localhost/request", {
    headers: { accept: "text/html", "accept-language": "en-US" },
  });
  const response = await proxy(request);
  expect(getClaims).toHaveBeenCalled();
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("http://localhost/en/request");
  expect(response.cookies.get("tf75-refreshed")?.value).toBe("renewed");
  expect(response.cookies.get("nj_locale")?.value).toBe("en");
});
