"use client";

import { useState, useTransition } from "react";
import { revealCaseContact } from "../actions";

type Contact = {
  name: string | null;
  phone: string | null;
  lineId: string | null;
  address: string | null;
};

export function CaseContact({ caseId }: { caseId: string }) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function reveal() {
    startTransition(async () => {
      const result = await revealCaseContact(caseId);
      if (result.contact) {
        setContact(result.contact);
        setError(null);
      } else setError(result.error ?? "ไม่สามารถแสดงข้อมูลติดต่อได้");
    });
  }
  return (
    <section className="flex flex-col gap-3 rounded-[14px] border p-4" aria-label="ข้อมูลติดต่อ">
      <h2 className="font-heading text-xl font-semibold">ข้อมูลติดต่อ</h2>
      {!contact && (
        <button
          type="button"
          onClick={reveal}
          disabled={pending}
          className="bg-primary-600 min-h-12 w-fit rounded-full px-5 font-semibold text-white disabled:opacity-50"
        >
          {pending ? "กำลังโหลด…" : "แสดงเบอร์โทร"}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
      {contact && (
        <div className="flex flex-col gap-2 break-words">
          {contact.name && <p>ชื่อผู้ติดต่อ: {contact.name}</p>}
          {contact.address && <p>ที่อยู่: {contact.address}</p>}
          {contact.phone && (
            <a
              className="text-primary-600 inline-flex min-h-12 items-center underline"
              href={`tel:${contact.phone.replace(/[^+\d]/g, "")}`}
            >
              โทร {contact.phone}
            </a>
          )}
          {contact.lineId && (
            <a
              className="text-primary-600 inline-flex min-h-12 items-center underline"
              href={`https://line.me/R/ti/p/~${encodeURIComponent(contact.lineId.replace(/^@/, ""))}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              ติดต่อ LINE: {contact.lineId}
            </a>
          )}
        </div>
      )}
    </section>
  );
}
