import { formatThaiDateTime, formatThaiTime } from "../domain/thai-date";
import { format, type Locale } from "./locale";
import type { ReporterText } from "./reporter-text";

// ── TF-63 ตัวช่วยแสดงเวลา/ระยะบนหน้าติดตามตามภาษา (ตัวเลขคำนวณที่ src/lib/domain/tracking.ts เหมือนเดิม) ──

type TrackText = ReporterText["track"];

export function etaLabel(minutes: number, t: TrackText): string {
  if (minutes < 60) return format(t.etaMinutes, { n: minutes });
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? format(t.etaHoursMinutes, { h, m }) : format(t.etaHours, { h });
}

export function distanceLabel(distanceM: number, t: TrackText): string {
  return distanceM < 1000
    ? format(t.meters, { n: Math.round(distanceM / 10) * 10 })
    : format(t.kilometers, { n: (distanceM / 1000).toFixed(distanceM < 10_000 ? 1 : 0) });
}

export function agoLabel(since: Date | string, now: number, t: TrackText): string {
  const seconds = Math.max(0, Math.round((now - new Date(since).getTime()) / 1000));
  if (seconds < 5) return t.justNow;
  if (seconds < 60) return format(t.secondsAgo, { n: seconds });
  return format(t.minutesAgo, { n: Math.floor(seconds / 60) });
}

/** เวลาไทย พ.ศ. สำหรับหน้าไทย / เวลาไทย (Asia/Bangkok) แบบสากลสำหรับหน้าอังกฤษ */
export function timeLabel(value: Date | string, locale: Locale): string {
  if (locale === "th") return formatThaiTime(value);
  return new Date(value).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function dateTimeLabel(value: Date | string, locale: Locale): string {
  if (locale === "th") return formatThaiDateTime(value);
  return new Date(value).toLocaleString("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
