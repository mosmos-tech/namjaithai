import Link from "next/link";
import type { IncomingTransfer, UserRole } from "@/lib/domain";
import { IncomingTransfers } from "./IncomingTransfers";
import { MyTaskCard, type MyTask } from "./MyTaskCard";
import { MyTasksLive } from "./MyTasksLive";
import { DutyModeToggle } from "./DutyModeToggle";

export function MyTasksView({
  role,
  tasks,
  loadError,
  notesError,
  incoming = [],
}: {
  role: UserRole;
  tasks: MyTask[];
  loadError: boolean;
  notesError: boolean;
  // TF-59: คำขอส่งต่อที่หน่วยอื่นส่งมาให้หน่วยของเรา
  incoming?: IncomingTransfer[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <DutyModeToggle role={role} />
      <MyTasksLive role={role} />
      <IncomingTransfers transfers={incoming} />
      {loadError ? (
        <section role="alert" className="flex flex-col items-start gap-3 rounded-[14px] border p-5">
          <p className="text-lg">โหลดรายการงานไม่สำเร็จ กรุณาลองอีกครั้ง</p>
          <a
            href="/rescue/my-tasks"
            className="bg-primary-600 text-text-on-primary inline-flex min-h-14 items-center rounded-full px-6 text-lg font-semibold"
          >
            ลองอีกครั้ง
          </a>
        </section>
      ) : (
        <>
          {notesError && <p role="alert">โหลดโน้ตล่าสุดไม่สำเร็จ กรุณาลองโหลดหน้าใหม่</p>}
          {tasks.length === 0 ? (
            <section className="flex flex-col items-start gap-3 rounded-[14px] border p-5">
              <p className="text-lg">ตอนนี้ยังไม่มีเคสที่คุณรับไว้</p>
              <Link
                href="/rescue/cases"
                className="bg-primary-600 text-text-on-primary inline-flex min-h-14 items-center rounded-full px-6 text-lg font-semibold"
              >
                ดูรายการเคสที่รอรับ
              </Link>
            </section>
          ) : (
            tasks.map((task) => <MyTaskCard key={task.id} task={task} />)
          )}
        </>
      )}
    </div>
  );
}
