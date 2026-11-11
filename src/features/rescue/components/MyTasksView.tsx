import Link from "next/link";
import type { UserRole } from "@/lib/domain";
import { MyTaskCard, type MyTask } from "./MyTaskCard";
import { MyTasksLive } from "./MyTasksLive";
import { DutyModeToggle } from "./DutyModeToggle";

export function MyTasksView({
  role,
  tasks,
  loadError,
  notesError,
}: {
  role: UserRole;
  tasks: MyTask[];
  loadError: boolean;
  notesError: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <DutyModeToggle role={role} />
      <MyTasksLive role={role} />
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
