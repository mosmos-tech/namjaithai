import { userRoleLabel } from "@/lib/domain";
import { requireAccess } from "../server/require-role";

/**
 * โครงหน้าชั่วคราวของหน้าที่ต้องล็อกอิน (TF-17) — แต่ละการ์ดมาเติมเนื้อหาจริงทีหลัง
 * ต้องอยู่ใน <Suspense> เพราะอ่าน cookie ล็อกอิน
 */
export async function SignedInShell({
  pathname,
  title,
  comingIn,
  denied,
}: {
  pathname: string;
  title: string;
  comingIn: string;
  denied: Promise<boolean>;
}) {
  const [user, wasDenied] = await Promise.all([requireAccess(pathname), denied]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-8 sm:px-6 sm:py-12">
      {wasDenied && (
        <p role="alert" className="rounded-[12px] bg-amber-50 px-4 py-3 text-lg text-amber-700">
          บัญชีของคุณไม่มีสิทธิ์เปิดหน้านั้น จึงพากลับมาหน้าของคุณ
        </p>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-text-secondary text-lg">
            สวัสดี {user.displayName} · {userRoleLabel[user.role]}
          </p>
          <h1 className="font-heading text-text-primary mt-1 text-[30px] font-bold">{title}</h1>
        </div>
        <form action="/auth/logout" method="post">
          <button
            type="submit"
            className="border-border-strong bg-bg-surface font-heading text-text-primary hover:bg-bg-subtle inline-flex min-h-12 items-center rounded-full border px-5 text-base font-semibold"
          >
            ออกจากระบบ
          </button>
        </form>
      </div>
      <p className="border-border-default bg-bg-surface text-text-secondary rounded-[14px] border p-6 text-lg">
        หน้านี้กำลังพัฒนา ({comingIn})
      </p>
    </div>
  );
}
