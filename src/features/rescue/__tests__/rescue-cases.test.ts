import { describe, expect, it, vi } from "vitest";
import { RescueCaseSort, RESCUE_CASE_PAGE_SIZE } from "../../../lib/domain";
import { fetchAllRescueCases, fetchRescueCasePage, fetchRescueCasePages } from "../rescue-cases";

function makeMockRpcRow(index: number, totalCount = 150) {
  return {
    id: `case-id-${index}`,
    case_code: `TF-CASE-${index}`,
    status: "NEW" as const,
    incident_type: "FLOOD" as const,
    urgency: "RED" as const,
    triage_reasons: ["FLOOD_LEVEL_ROOF"],
    system_urgency: "RED" as const,
    urgency_override_reason: null,
    priority_score: 100,
    created_at: new Date(Date.now() - index * 60_000).toISOString(),
    lat: 13.75 + index * 0.001,
    lng: 100.5 + index * 0.001,
    accuracy_m: 20,
    location_source: "GPS",
    province: "กรุงเทพมหานคร",
    district: "พระนคร",
    subdistrict: "พระบรมมหาราชวัง",
    landmark: `จุดสังเกต ${index}`,
    adults: 2,
    elderly: 1,
    bedridden: 0,
    children: 0,
    pets: 1,
    distance_m: 500 + index * 10,
    sort_k1: `k1-${index}`,
    sort_k2: `k2-${index}`,
    sort_k3: `k3-${index}`,
    total_count: totalCount,
  };
}

describe("TF-22 / TF-23 rescue-cases: การดึงข้อมูลและ pagination", () => {
  it("toRescueCase แมปพิกัด lat, lng และไม่มีเบอร์โทรหรือชื่อผู้แจ้ง", async () => {
    const row = makeMockRpcRow(1, 1);
    const mockRpc = vi.fn().mockResolvedValue({ data: [row], error: null });
    const mockSupabase = { rpc: mockRpc as never };

    const page = await fetchRescueCasePage(mockSupabase, {
      sort: RescueCaseSort.PRIORITY,
      radiusM: null,
      location: null,
    });

    expect(page.cases).toHaveLength(1);
    const item = page.cases[0];
    expect(item.lat).toBe(row.lat);
    expect(item.lng).toBe(row.lng);
    expect(item.caseCode).toBe(row.case_code);
    expect(item.area).toBe("พระบรมมหาราชวัง · พระนคร · กรุงเทพมหานคร");

    // ตรวจสอบความปลอดภัยข้อมูลส่วนตัว (PDPA / Privacy)
    expect(item).not.toHaveProperty("phone");
    expect(item).not.toHaveProperty("reporter_phone");
    expect(item).not.toHaveProperty("contact_phone");
    expect(item).not.toHaveProperty("name");
    expect(item).not.toHaveProperty("reporter_name");
  });

  it("fetchRescueCasePage คำนวณ cursor next เมื่อข้อมูลครบขนาดหน้า (100 แถว)", async () => {
    const rows = Array.from({ length: RESCUE_CASE_PAGE_SIZE }, (_, i) => makeMockRpcRow(i, 250));
    const mockRpc = vi.fn().mockResolvedValue({ data: rows, error: null });
    const mockSupabase = { rpc: mockRpc as never };

    const page = await fetchRescueCasePage(mockSupabase, {
      sort: RescueCaseSort.PRIORITY,
      radiusM: 5000,
      location: { lat: 13.75, lng: 100.5 },
    });

    expect(page.cases).toHaveLength(100);
    expect(page.total).toBe(250);
    expect(page.next).toEqual({
      k1: "k1-99",
      k2: "k2-99",
      k3: "k3-99",
      id: "case-id-99",
    });
  });

  it("fetchRescueCasePage คืน next = null เมื่อข้อมูลมีไม่ถึงขนาดหน้า", async () => {
    const rows = Array.from({ length: 42 }, (_, i) => makeMockRpcRow(i, 42));
    const mockRpc = vi.fn().mockResolvedValue({ data: rows, error: null });
    const mockSupabase = { rpc: mockRpc as never };

    const page = await fetchRescueCasePage(mockSupabase, {
      sort: RescueCaseSort.PRIORITY,
      radiusM: null,
      location: null,
    });

    expect(page.cases).toHaveLength(42);
    expect(page.next).toBeNull();
  });

  it("fetchAllRescueCases ดึงครบทุกหน้าเมื่อเคสเกิน page size เพื่อให้แผนที่แสดงครบทุกหมุด", async () => {
    const page1Rows = Array.from({ length: RESCUE_CASE_PAGE_SIZE }, (_, i) =>
      makeMockRpcRow(i, 140),
    );
    const page2Rows = Array.from({ length: 40 }, (_, i) => makeMockRpcRow(100 + i, 140));

    const mockRpc = vi
      .fn()
      // เรียกครั้งที่ 1 (after = null)
      .mockResolvedValueOnce({ data: page1Rows, error: null })
      // เรียกครั้งที่ 2 (after = cursor จากหน้า 1)
      .mockResolvedValueOnce({ data: page2Rows, error: null });

    const mockSupabase = { rpc: mockRpc as never };

    const result = await fetchAllRescueCases(mockSupabase, {
      sort: RescueCaseSort.PRIORITY,
      radiusM: 10000,
      location: { lat: 13.75, lng: 100.5 },
    });

    expect(mockRpc).toHaveBeenCalledTimes(2);

    // ตรวจสอบว่าพารามิเตอร์ cursor ถูกส่งในรอบที่ 2
    expect(mockRpc).toHaveBeenNthCalledWith(1, "list_rescue_cases", {
      p_lat: 13.75,
      p_lng: 100.5,
      p_radius_m: 10000,
      p_sort: RescueCaseSort.PRIORITY,
      p_after_k1: null,
      p_after_k2: null,
      p_after_k3: null,
      p_after_id: null,
      p_limit: RESCUE_CASE_PAGE_SIZE,
    });

    expect(mockRpc).toHaveBeenNthCalledWith(2, "list_rescue_cases", {
      p_lat: 13.75,
      p_lng: 100.5,
      p_radius_m: 10000,
      p_sort: RescueCaseSort.PRIORITY,
      p_after_k1: "k1-99",
      p_after_k2: "k2-99",
      p_after_k3: "k3-99",
      p_after_id: "case-id-99",
      p_limit: RESCUE_CASE_PAGE_SIZE,
    });

    // ผลลัพธ์ต้องรวมเคสจากทั้ง 2 หน้า (100 + 40 = 140)
    expect(result.cases).toHaveLength(140);
    expect(result.total).toBe(140);
    expect(result.cases[0].caseCode).toBe("TF-CASE-0");
    expect(result.cases[139].caseCode).toBe("TF-CASE-139");

    // หมุดทุกตัวมีพิกัดพร้อมแสดงบนแผนที่
    for (const c of result.cases) {
      expect(typeof c.lat).toBe("number");
      expect(typeof c.lng).toBe("number");
    }
  });

  it("fetchAllRescueCases ดึงต่อเนื่องเกิน 20 หน้าได้โดยไม่ตัดเคสทิ้งเงียบ ๆ", async () => {
    // จำลอง 25 หน้า หน้าละ 100 เคส (รวม 2,450 เคส)
    const totalPages = 25;
    const mockRpc = vi.fn();

    for (let p = 0; p < totalPages; p++) {
      const isLast = p === totalPages - 1;
      const count = isLast ? 50 : RESCUE_CASE_PAGE_SIZE;
      const rows = Array.from({ length: count }, (_, i) =>
        makeMockRpcRow(p * RESCUE_CASE_PAGE_SIZE + i, 2450),
      );
      mockRpc.mockResolvedValueOnce({ data: rows, error: null });
    }

    const mockSupabase = { rpc: mockRpc as never };

    const result = await fetchAllRescueCases(mockSupabase, {
      sort: RescueCaseSort.PRIORITY,
      radiusM: null,
      location: null,
    });

    expect(mockRpc).toHaveBeenCalledTimes(25);
    // ได้เคสครบทั้ง 25 หน้า ไม่ถูกตัดที่ 20 หน้า
    expect(result.cases).toHaveLength(2450);
    expect(result.total).toBe(2450);
  });

  it("fetchAllRescueCases ป้องกัน cursor วนซ้ำและโยนข้อผิดพลาดชัดเจน", async () => {
    const page1Rows = Array.from({ length: RESCUE_CASE_PAGE_SIZE }, (_, i) =>
      makeMockRpcRow(i, 500),
    );
    // จำลอง backend คืน cursor เดิมซ้ำ (cursor loop)
    const page2Rows = Array.from({ length: RESCUE_CASE_PAGE_SIZE }, (_, i) => ({
      ...makeMockRpcRow(100 + i, 500),
      sort_k1: "k1-99",
      sort_k2: "k2-99",
      sort_k3: "k3-99",
      id: "case-id-99", // cursor เดิมเหมือนหน้า 1
    }));

    const mockRpc = vi
      .fn()
      .mockResolvedValueOnce({ data: page1Rows, error: null })
      .mockResolvedValueOnce({ data: page2Rows, error: null });

    const mockSupabase = { rpc: mockRpc as never };

    await expect(
      fetchAllRescueCases(mockSupabase, {
        sort: RescueCaseSort.PRIORITY,
        radiusM: null,
        location: null,
      }),
    ).rejects.toThrow("พบ cursor วนซ้ำในการดึงข้อมูลเคส (id: case-id-99)");
  });

  it("fetchAllRescueCases โยนข้อผิดพลาดชัดเจนเมื่อเกิน maxPages โดยไม่แสดงเสมือนว่าดึงครบแล้ว", async () => {
    // จำลองเคสที่มีหน้าต่อไปเรื่อยๆ แต่ละหน้ามี cursor ต่างกัน
    let pageCount = 0;
    const mockRpc = vi.fn().mockImplementation(() => {
      pageCount++;
      const rows = Array.from({ length: RESCUE_CASE_PAGE_SIZE }, (_, i) =>
        makeMockRpcRow(pageCount * 1000 + i, 5000),
      );
      return Promise.resolve({ data: rows, error: null });
    });
    const mockSupabase = { rpc: mockRpc as never };

    await expect(
      fetchAllRescueCases(
        mockSupabase,
        {
          sort: RescueCaseSort.PRIORITY,
          radiusM: null,
          location: null,
        },
        3, // จำกัดที่ 3 หน้า
      ),
    ).rejects.toThrow("ดึงข้อมูลเคสไม่ครบถ้วน (เกินขีดจำกัดความปลอดภัย 3 หน้า)");
  });

  it("fetchRescueCasePages ดึงครบตามจำนวนหน้าที่เปิดค้างไว้และหยุดทันทีเมื่อข้อมูลเหลือน้อยกว่านั้น", async () => {
    const page1Rows = Array.from({ length: RESCUE_CASE_PAGE_SIZE }, (_, i) =>
      makeMockRpcRow(i, 125),
    );
    const page2Rows = Array.from({ length: 25 }, (_, i) => makeMockRpcRow(100 + i, 125));

    const mockRpc = vi
      .fn()
      .mockResolvedValueOnce({ data: page1Rows, error: null })
      .mockResolvedValueOnce({ data: page2Rows, error: null });

    const result = await fetchRescueCasePages(
      { rpc: mockRpc as never },
      { sort: RescueCaseSort.PRIORITY, radiusM: null, location: null },
      3, // ขอ 3 หน้า แต่มีข้อมูลจริง 2 หน้า
    );

    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(result.cases).toHaveLength(125);
    expect(result.total).toBe(125);
    expect(result.next).toBeNull();
  });
});
