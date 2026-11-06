"use client";

import { useEffect, useState } from "react";
import {
  formatThaiDate,
  isMembershipActive,
  type MemberReviewDecision,
  type UnitMemberStatus,
} from "@/lib/domain";

type UnitItem = {
  id: string;
  name: string;
};

type UnitMemberItem = {
  id: string;
  unit_id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  has_line: boolean;
  status: UnitMemberStatus;
  duty_status: string;
  cases: { code: string; status: string }[];
  is_on_duty: boolean;
  approved_at: string | null;
  expires_at: string | null;
  created_at: string;
};

export function UnitMemberApprovalPanel() {
  const [units, setUnits] = useState<UnitItem[]>([]);
  const [members, setMembers] = useState<UnitMemberItem[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function refresh() {
    const response = await fetch("/api/unit-members", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("โหลดรายชื่อสมาชิกไม่สำเร็จ");
    }
    const body = (await response.json()) as {
      units: UnitItem[];
      members: UnitMemberItem[];
    };
    setUnits(body.units ?? []);
    setMembers(body.members ?? []);
    setSelectedUnitId((prev) => prev || body.units?.[0]?.id || "");
  }

  useEffect(() => {
    void fetch("/api/unit-members", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("โหลดรายชื่อสมาชิกไม่สำเร็จ");
        }
        const body = (await response.json()) as {
          units: UnitItem[];
          members: UnitMemberItem[];
        };
        setUnits(body.units ?? []);
        setMembers(body.members ?? []);
        setSelectedUnitId((prev) => prev || body.units?.[0]?.id || "");
      })
      .catch(() => setErrorMessage("โหลดรายชื่อสมาชิกไม่สำเร็จ กรุณาลองใหม่"))
      .finally(() => setLoading(false));
  }, []);

  const unitMembers = members.filter((m) => m.unit_id === selectedUnitId);
  const activeMembers = unitMembers.filter((member) =>
    isMembershipActive({ status: member.status, expiresAt: member.expires_at, unitIsActive: true }),
  );
  const pendingMembers = unitMembers.filter((m) => m.status === "PENDING");
  const reviewedMembers = unitMembers.filter((m) => m.status !== "PENDING");

  const validSelectedIds = selectedIds.filter((id) => pendingMembers.some((m) => m.id === id));

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  function toggleSelectAllPending() {
    if (validSelectedIds.length === pendingMembers.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(pendingMembers.map((m) => m.id));
    }
  }

  async function submitDecision(memberIds: string[], decision: MemberReviewDecision) {
    if (!selectedUnitId || memberIds.length === 0) return;
    setBusy(true);
    setStatusMessage("");
    setErrorMessage("");
    try {
      const response = await fetch("/api/unit-members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId: selectedUnitId,
          memberIds,
          decision,
        }),
      });
      if (!response.ok) {
        throw new Error("บันทึกไม่สำเร็จ");
      }
      const result = (await response.json()) as { count?: number };
      const count = result.count ?? memberIds.length;
      await refresh();
      setSelectedIds((prev) => prev.filter((id) => !memberIds.includes(id)));

      if (decision === "APPROVED") {
        setStatusMessage(
          `อนุมัติสมาชิก ${count} คนแล้ว (สิทธิ์ใช้งาน 90 วัน) และแจ้งผลทาง LINE แล้ว`,
        );
      } else if (decision === "REJECTED") {
        setStatusMessage(`ปฏิเสธคำขอ ${count} คนแล้ว และแจ้งผลทาง LINE แล้ว`);
      } else {
        setStatusMessage(`ระงับสมาชิก ${count} คนแล้ว และแจ้งผลทาง LINE แล้ว`);
      }
    } catch {
      setErrorMessage("ไม่สามารถอัปเดตสถานะสมาชิกได้ กรุณาลองใหม่");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="approval-queue-heading"
      className="bg-bg-surface border-border-default mt-6 rounded-2xl border p-5 sm:p-7"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2
            id="approval-queue-heading"
            className="font-heading text-text-primary text-xl font-bold"
          >
            คิวอนุมัติและระงับสมาชิก
          </h2>
          <p className="text-text-secondary mt-1">
            อนุมัติหรือปฏิเสธผู้ที่สมัครผ่านลิงก์ใน LINE ได้ทีละคนหรือหลายคน (สิทธิ์กู้ภัยมีอายุ 90
            วัน)
          </p>
        </div>
        {units.length > 1 && (
          <label className="text-text-primary flex flex-col gap-1 text-sm font-medium">
            หน่วยที่จัดการ
            <select
              aria-label="หน่วยที่จัดการ"
              className="border-border-strong min-h-12 rounded-lg border bg-white px-3 text-base"
              value={selectedUnitId}
              onChange={(e) => {
                setSelectedUnitId(e.target.value);
                setSelectedIds([]);
              }}
            >
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {selectedUnitId && (
        <div className="mt-5">
          <h3 className="font-heading text-text-primary text-xl font-semibold">
            {units.find((unit) => unit.id === selectedUnitId)?.name}
          </h3>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-xl bg-blue-50 p-3">
              <strong className="block text-xl">{activeMembers.length}</strong>
              สมาชิก
            </div>
            <div className="rounded-xl bg-emerald-50 p-3">
              <strong className="block text-xl">
                {
                  activeMembers.filter(
                    (member) => member.is_on_duty && member.duty_status !== "OFFLINE",
                  ).length
                }
              </strong>
              ออนไลน์
            </div>
            <div className="rounded-xl bg-amber-50 p-3">
              <strong className="block text-xl">
                {activeMembers.filter((member) => member.cases?.length).length}
              </strong>
              กำลังทำเคส
            </div>
          </div>
        </div>
      )}
      {statusMessage && (
        <p
          role="status"
          className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 font-medium text-emerald-900"
        >
          {statusMessage}
        </p>
      )}
      {errorMessage && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 font-medium text-red-700">
          {errorMessage}
        </p>
      )}

      {loading ? (
        <p className="text-text-secondary mt-5 rounded-xl bg-slate-50 p-4">
          กำลังโหลดรายชื่อผู้สมัครและสมาชิก…
        </p>
      ) : units.length === 0 ? (
        <p className="text-text-secondary mt-5 rounded-xl bg-slate-50 p-4">
          ยังไม่มีหน่วยที่คุณจัดการได้
        </p>
      ) : (
        <>
          {/* ส่วนที่ 1: คิวรออนุมัติ */}
          <div className="mt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-heading text-text-primary text-lg font-bold">
                คิวรออนุมัติ ({pendingMembers.length} คน)
              </h3>
              {pendingMembers.length > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={toggleSelectAllPending}
                  className="border-border-strong text-text-primary inline-flex min-h-12 items-center rounded-full border bg-white px-4 text-sm font-semibold disabled:opacity-50"
                >
                  {validSelectedIds.length === pendingMembers.length
                    ? "ยกเลิกการเลือกทั้งหมด"
                    : "เลือกทั้งหมด"}
                </button>
              )}
            </div>

            {validSelectedIds.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-blue-50 p-3">
                <span className="text-text-primary text-sm font-semibold">
                  เลือกแล้ว {validSelectedIds.length} คน:
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void submitDecision(validSelectedIds, "APPROVED")}
                  className="font-heading bg-primary-600 inline-flex min-h-12 items-center rounded-full px-5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  อนุมัติที่เลือก ({validSelectedIds.length})
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void submitDecision(validSelectedIds, "REJECTED")}
                  className="font-heading inline-flex min-h-12 items-center rounded-full bg-red-600 px-5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  ปฏิเสธที่เลือก ({validSelectedIds.length})
                </button>
              </div>
            )}

            {pendingMembers.length === 0 ? (
              <p className="text-text-secondary mt-3 rounded-xl bg-slate-50 p-4">
                ไม่มีผู้สมัครรออนุมัติในขณะนี้
              </p>
            ) : (
              <ul aria-label="รายการผู้สมัครรออนุมัติ" className="mt-3 grid gap-3">
                {pendingMembers.map((member) => {
                  const checked = validSelectedIds.includes(member.id);
                  return (
                    <li
                      key={member.id}
                      className="border-border-default flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <label className="flex min-w-0 cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSelect(member.id)}
                          aria-label={`เลือก ${member.display_name}`}
                          className="mt-1 h-5 w-5 shrink-0 accent-blue-600"
                        />
                        <div className="min-w-0">
                          <p className="text-text-primary font-semibold break-words">
                            {member.display_name}
                          </p>
                          <p className="text-text-secondary text-sm">
                            สมัครผ่าน LINE เมื่อ {formatThaiDate(member.created_at)} · สถานะ
                            รออนุมัติ
                          </p>
                        </div>
                      </label>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void submitDecision([member.id], "APPROVED")}
                          className="font-heading bg-primary-600 inline-flex min-h-12 items-center rounded-full px-5 font-semibold text-white disabled:opacity-50"
                        >
                          อนุมัติ
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void submitDecision([member.id], "REJECTED")}
                          className="font-heading inline-flex min-h-12 items-center rounded-full bg-red-50 px-5 font-semibold text-red-700 disabled:opacity-50"
                        >
                          ปฏิเสธ
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* ส่วนที่ 2: สมาชิกในหน่วยและการระงับสิทธิ์ */}
          <div className="mt-8 border-t pt-6">
            <h3 className="font-heading text-text-primary text-lg font-bold">
              สมาชิกในหน่วย ({reviewedMembers.length} คน)
            </h3>
            {reviewedMembers.length === 0 ? (
              <p className="text-text-secondary mt-3 rounded-xl bg-slate-50 p-4">
                ยังไม่มีสมาชิกที่ผ่านการพิจารณาในหน่วยนี้
              </p>
            ) : (
              <ul aria-label="รายการสมาชิกในหน่วย" className="mt-3 grid gap-3">
                {reviewedMembers.map((member) => {
                  const active = isMembershipActive({
                    status: member.status,
                    expiresAt: member.expires_at,
                    unitIsActive: true,
                  });

                  let badgeText = "ไม่อนุมัติ";
                  let badgeClass = "bg-slate-100 text-slate-700";
                  if (member.status === "APPROVED" && active) {
                    badgeText = "อนุมัติแล้ว";
                    badgeClass = "bg-emerald-50 text-emerald-800";
                  } else if (member.status === "APPROVED" && !active) {
                    badgeText = "สิทธิ์หมดอายุแล้ว";
                    badgeClass = "bg-amber-50 text-amber-800";
                  } else if (member.status === "SUSPENDED") {
                    badgeText = "ถูกระงับสิทธิ์";
                    badgeClass = "bg-red-50 text-red-700";
                  }

                  return (
                    <li
                      key={member.id}
                      className="border-border-default flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-text-primary font-semibold break-words">
                            {member.display_name}
                          </p>
                          <span
                            className={`inline-flex rounded-full px-3 py-0.5 text-xs font-semibold ${badgeClass}`}
                          >
                            {badgeText}
                          </span>
                        </div>
                        {active && (
                          <div className="text-text-secondary mt-2 text-sm">
                            <p>
                              สถานะ:{" "}
                              {member.is_on_duty
                                ? ((
                                    {
                                      AVAILABLE: "ว่าง",
                                      EN_ROUTE: "กำลังเดินทาง",
                                      ON_SITE: "ถึงจุดเกิดเหตุ",
                                      OFFLINE: "ออฟไลน์",
                                    } as Record<string, string>
                                  )[member.duty_status] ?? "ออฟไลน์")
                                : "ออฟไลน์"}
                            </p>
                            <p>
                              เคสที่กำลังทำ:{" "}
                              {member.cases?.length
                                ? member.cases.map((item) => item.code).join(", ")
                                : "ไม่มี"}
                            </p>
                          </div>
                        )}
                        <p className="text-text-secondary mt-1 text-sm">
                          {member.status === "APPROVED" && member.expires_at
                            ? `สิทธิ์หมดอายุ ${formatThaiDate(member.expires_at)} (อายุสิทธิ์ 90 วัน)`
                            : member.status === "SUSPENDED"
                              ? "หลุดสิทธิ์เข้าหน้ากู้ภัยแล้ว"
                              : "ไม่ได้รับสิทธิ์เข้าหน้ากู้ภัย"}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {member.status === "APPROVED" && active ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void submitDecision([member.id], "SUSPENDED")}
                            className="font-heading inline-flex min-h-12 items-center rounded-full bg-red-50 px-5 font-semibold text-red-700 disabled:opacity-50"
                          >
                            ระงับสมาชิก
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void submitDecision([member.id], "APPROVED")}
                            className="border-border-strong text-text-primary font-heading inline-flex min-h-12 items-center rounded-full border bg-white px-5 font-semibold disabled:opacity-50"
                          >
                            อนุมัติอีกครั้ง (90 วัน)
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
