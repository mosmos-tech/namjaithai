// จำว่าก่อนล็อกอินจะไปหน้าไหน (เช่น เปิด /rescue แล้วโดนพามาล็อกอิน)
// เก็บใน cookie แทน ?next= ใน redirectTo เพราะ Supabase เช็ก redirect URL แบบตรงตัว ใส่ query เพิ่มไม่ได้
export const LOGIN_NEXT_COOKIE = "namjaithai-login-next";

export const LOGIN_NEXT_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 10 * 60, // 10 นาที พอสำหรับกดยืนยันใน LINE
  secure: process.env.NODE_ENV === "production",
};
