export const INVITE_COOKIE = "namjaithai-unit-invite";

export const INVITE_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 15 * 60,
  secure: process.env.NODE_ENV === "production",
};
