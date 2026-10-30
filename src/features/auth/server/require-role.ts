import { redirect } from "next/navigation";
import { decideAccess, homePathForRole } from "@/lib/domain";
import { getCurrentAppUser, type AppUser } from "./app-user";

/**
 * เช็กสิทธิ์ซ้ำในหน้าที่ต้องล็อกอิน (ด่านที่ 2 ต่อจาก proxy)
 * proxy อาจถูกข้ามได้ในบางกรณี (เช่น ตั้ง matcher ผิด) หน้าที่มีข้อมูลสำคัญจึงต้องเช็กเองด้วย
 * กติกาเดียวกับ proxy เพราะใช้ decideAccess ตัวเดียวกันจาก src/lib/domain
 */
export async function requireAccess(pathname: string): Promise<AppUser> {
  const user = await getCurrentAppUser();
  const decision = decideAccess(pathname, user);
  if (decision.allow && user) return user;

  if (decision.allow === false && decision.reason === "forbidden" && user) {
    redirect(`${homePathForRole(user.role)}?denied=1`);
  }
  if (decision.allow === false && decision.reason === "inactive") {
    redirect("/login?error=inactive");
  }
  redirect(`/login?next=${encodeURIComponent(pathname)}`);
}
