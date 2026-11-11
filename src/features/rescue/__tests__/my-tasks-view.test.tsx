import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MyTasksView } from "../components/MyTasksView";

vi.mock("../components/MyTasksLive", () => ({ MyTasksLive: () => null }));
vi.mock("../components/MyTaskCard", () => ({ MyTaskCard: () => null }));

describe("หน้างานของฉัน", () => {
  it("แสดงข้อผิดพลาดและทางลองใหม่เมื่อโหลดเคสไม่ได้ โดยไม่อ้างว่าไม่มีเคส", () => {
    const html = renderToStaticMarkup(
      createElement(MyTasksView, {
        role: "RESCUER",
        tasks: [],
        loadError: true,
        notesError: false,
      }),
    );
    expect(html).toContain("โหลดรายการงานไม่สำเร็จ");
    expect(html).toContain("ลองอีกครั้ง");
    expect(html).not.toContain("ตอนนี้ยังไม่มีเคสที่คุณรับไว้");
  });
  it("แสดงสถานะไม่มีเคสเมื่อโหลดสำเร็จและไม่มีรายการ", () => {
    const html = renderToStaticMarkup(
      createElement(MyTasksView, {
        role: "RESCUER",
        tasks: [],
        loadError: false,
        notesError: false,
      }),
    );
    expect(html).toContain("ตอนนี้ยังไม่มีเคสที่คุณรับไว้");
    expect(html).not.toContain("โหลดรายการงานไม่สำเร็จ");
  });
  it("แจ้งเมื่อโหลดโน้ตไม่ได้แต่ยังแสดงรายการงาน", () => {
    const html = renderToStaticMarkup(
      createElement(MyTasksView, {
        role: "RESCUER",
        tasks: [],
        loadError: false,
        notesError: true,
      }),
    );
    expect(html).toContain("โหลดโน้ตล่าสุดไม่สำเร็จ");
  });
});
