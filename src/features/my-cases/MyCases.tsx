import Link from "next/link";
import { requireAccess } from "@/features/auth/server/require-role";
import { createClient } from "@/lib/supabase/server";
import { formatThaiDateTime, reporterStatusView, trackPath, type CaseStatus } from "@/lib/domain";

type Row = {
  case_code: string;
  tracking_token: string;
  status: CaseStatus;
  created_at: string;
  province: string | null;
  district: string | null;
  subdistrict: string | null;
};

export async function MyCases({
  searchParams,
}: {
  searchParams: PageProps<"/my-cases">["searchParams"];
}) {
  const user = await requireAccess("/my-cases");
  const query = await searchParams;
  const rawPage = typeof query.page === "string" ? Number(query.page) : 1;
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 && rawPage <= 10000 ? rawPage : 1;
  const db = await createClient();
  const { data, error } = await db.rpc("get_my_cases", { p_offset: (page - 1) * 20 });
  const rows = (data ?? []) as Row[];
  const enabled = Boolean(
    process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN &&
    process.env.APP_BASE_URL &&
    (process.env.LINE_NOTIFICATIONS_SECRET?.length ?? 0) >= 16,
  );
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-text-secondary text-lg">สวัสดี {user.displayName}</p>
          <h1 className="font-heading text-text-primary text-3xl font-bold">เคสของฉัน</h1>
        </div>
        <form action="/auth/logout" method="post">
          <button
            className="border-border-strong min-h-12 rounded-full border px-5 text-lg"
            type="submit"
          >
            ออกจากระบบ
          </button>
        </form>
      </div>
      {query.denied === "1" && (
        <p role="alert" className="rounded-xl bg-amber-50 p-4 text-lg text-amber-700">
          บัญชีของคุณไม่มีสิทธิ์เปิดหน้านั้น จึงพากลับมาหน้าของคุณ
        </p>
      )}
      <p className="text-text-secondary text-lg">
        รายการที่คุณแจ้งขณะล็อกอินบัญชีนี้ กดเคสเพื่อดูสถานะได้ทันที
      </p>
      <p className="bg-bg-surface text-text-secondary rounded-[14px] p-5 text-base">
        {enabled
          ? "ระบบรองรับแจ้งเตือนสถานะทาง LINE เมื่อเพิ่มเพื่อน LINE Official Account ของโครงการแล้ว หากยังไม่ได้รับข้อความ ให้ติดตามสถานะบนเว็บได้เสมอ"
          : "การแจ้งเตือนสถานะทาง LINE ยังไม่เปิดใช้งาน คุณติดตามสถานะบนเว็บได้ตามปกติ"}
      </p>
      {error ? (
        <section role="alert" className="bg-bg-surface rounded-[14px] p-6 text-lg">
          โหลดรายการไม่สำเร็จ กรุณาลองใหม่{" "}
          <a href="/my-cases" className="text-primary-700 underline">
            โหลดอีกครั้ง
          </a>
        </section>
      ) : rows.length === 0 ? (
        <section className="bg-bg-surface rounded-[14px] p-6">
          <h2 className="font-heading text-text-primary text-xl font-semibold">
            {page === 1 ? "ยังไม่มีเคสที่แจ้งด้วยบัญชีนี้" : "ไม่มีเคสในหน้านี้"}
          </h2>
          <p className="text-text-secondary mt-3 text-lg">
            เคสที่แจ้งก่อนล็อกอินยังค้นหาได้ด้วยรหัสเคสและเบอร์โทร 4 ตัวท้าย
          </p>
        </section>
      ) : (
        <ul aria-label="รายการเคสของฉัน" className="flex flex-col gap-4">
          {rows.slice(0, 20).map((row) => (
            <li key={row.case_code}>
              <Link
                href={trackPath(row.case_code, row.tracking_token)}
                className="border-border-default bg-bg-surface hover:border-primary-600 block min-h-12 rounded-[14px] border p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-text-primary font-mono text-lg font-semibold">
                    {row.case_code}
                  </span>
                  <span className="bg-primary-50 text-primary-700 rounded-lg px-3 py-1 text-base">
                    {reporterStatusView(row.status).badge}
                  </span>
                </div>
                <p className="text-text-secondary mt-3 text-base">
                  แจ้งเมื่อ {formatThaiDateTime(row.created_at)}
                </p>
                <p className="text-text-secondary mt-1 text-base">
                  {[row.subdistrict, row.district, row.province].filter(Boolean).join(" · ") ||
                    "ไม่ระบุพื้นที่"}
                </p>
                <p className="text-primary-700 mt-4 text-lg font-semibold">ติดตามสถานะเคส →</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <nav aria-label="หน้ารายการเคส" className="flex flex-wrap justify-between gap-3">
        {page > 1 && (
          <Link
            className="text-primary-700 inline-flex min-h-12 items-center px-3 text-lg underline"
            href={`/my-cases?page=${page - 1}`}
          >
            หน้าก่อนหน้า
          </Link>
        )}
        {!error && rows.length > 20 && (
          <Link
            className="text-primary-700 inline-flex min-h-12 items-center px-3 text-lg underline"
            href={`/my-cases?page=${page + 1}`}
          >
            หน้าถัดไป
          </Link>
        )}
      </nav>
      <div className="flex flex-wrap gap-4">
        <Link
          href="/request"
          className="bg-primary-600 inline-flex min-h-12 items-center rounded-full px-5 text-lg font-semibold text-white"
        >
          แจ้งขอความช่วยเหลือ
        </Link>
        <Link
          href="/track"
          className="text-primary-700 inline-flex min-h-12 items-center px-3 text-lg underline"
        >
          ค้นหาด้วยรหัสเคส
        </Link>
      </div>
    </div>
  );
}
