/**
 * TF-68: แสดงระหว่างรอ JS ของหน้าโหลดและ hydrate เสร็จ (ปุ่มยังกดไม่ได้)
 * - "กำลังโหลด..." มองเห็นได้และโปรแกรมอ่านหน้าจออ่านได้ (role="status")
 * - เกิน 5 วินาที (CSS ล้วน ไม่ต้องรอ JS) ขึ้นทางเลือกโทร/SMS ที่เป็นลิงก์ธรรมดา กดได้แม้ JS ยังไม่มา
 * เป็น Server Component ได้ (ไม่มี state) จึงอยู่ใน HTML ตั้งแต่แรก
 */
export function HydrationPending({ emergencyHelp = false }: { emergencyHelp?: boolean }) {
  return (
    <div role="status" className="flex flex-col gap-4" data-testid="hydration-pending">
      <p className="text-text-secondary text-lg">กำลังโหลด...</p>
      {emergencyHelp && (
        <div
          className="reveal-after-5s flex flex-col gap-3 rounded-[12px] border border-red-200 bg-red-50 p-4"
          data-testid="slow-load-help"
        >
          <p className="font-heading text-lg font-semibold text-red-800">
            ถ้าเว็บโหลดช้า โทร 1669 หรือส่ง SMS ได้ทันที
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <a
              href="tel:1669"
              className="inline-flex min-h-14 flex-1 items-center justify-center rounded-full bg-red-700 px-6 text-lg font-semibold text-white"
            >
              โทร 1669
            </a>
            <a
              href={`sms:?body=${encodeURIComponent("ขอความช่วยเหลือฉุกเฉิน กรุณาติดต่อกลับ")}`}
              className="inline-flex min-h-14 flex-1 items-center justify-center rounded-full border-2 border-red-700 bg-white px-6 text-lg font-semibold text-red-700"
            >
              ส่ง SMS
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
