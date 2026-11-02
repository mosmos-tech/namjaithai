// แสดงวันเวลาแบบไทย: ปี พ.ศ. และเวลาไทยเสมอ ไม่ว่าเครื่องผู้ใช้หรือเซิร์ฟเวอร์ตั้งเขตเวลาไหน

const TIME = new Intl.DateTimeFormat("th-TH", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Bangkok",
});

const DATE = new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Bangkok",
});

// "14:48 น."
export function formatThaiTime(value: Date | string): string {
  return `${TIME.format(new Date(value))} น.`;
}

// "30 ต.ค. 2569"
export function formatThaiDate(value: Date | string): string {
  return DATE.format(new Date(value));
}

// "30 ต.ค. 2569 · 14:48 น."
export function formatThaiDateTime(value: Date | string): string {
  return `${formatThaiDate(value)} · ${formatThaiTime(value)}`;
}
