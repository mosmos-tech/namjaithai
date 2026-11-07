// Invoke from a scheduler only after the LINE OA and server environment are ready.
const secret = process.env.LINE_NOTIFICATIONS_SECRET;
if (!secret || secret.length < 16 || !process.env.APP_BASE_URL) {
  throw new Error(
    "Configure APP_BASE_URL and LINE_NOTIFICATIONS_SECRET before running this worker",
  );
}
const origin = new URL(process.env.APP_BASE_URL);
if (
  (origin.protocol !== "https:" &&
    !(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname))) ||
  origin.username ||
  origin.password
) {
  throw new Error("APP_BASE_URL must be a public HTTPS origin or local development origin");
}
const response = await fetch(new URL("/api/notifications/line", origin.origin), {
  method: "POST",
  headers: { Authorization: `Bearer ${secret}` },
  signal: AbortSignal.timeout(60000),
});
if (!response.ok) throw new Error(`Notification worker returned HTTP ${response.status}`);
const result = await response.json();
// TF-34: ผลแยกตามคิว (cases / redAlerts / members) และ paused เมื่อโควตาหมด — ไม่มีข้อมูลส่วนตัว
console.log(JSON.stringify(result));
