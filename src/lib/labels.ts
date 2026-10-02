import { diffDays, formatHebrewDate } from "./dates";
import { timeRangeLabel, weekdayOf } from "./shiftTime";

export const DAY_LABELS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
export const DAY_SHORT_LABELS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

export function dayLabel(dateOnly: string): string {
  return DAY_LABELS[weekdayOf(dateOnly)];
}

/** "ראשון 04.10 · בוקר 08:00-16:00" */
export function shiftLabel(workDate: string, shiftName: string, startsAt: string, endsAt: string): string {
  return `${dayLabel(workDate)} ${formatHebrewDate(workDate)} · ${shiftName} ${timeRangeLabel(startsAt, endsAt)}`;
}

export function dateRangeLabel(startDate: string, endDate: string): string {
  return startDate === endDate ? formatHebrewDate(startDate) : `${formatHebrewDate(startDate)}-${formatHebrewDate(endDate)}`;
}

export function daysInRange(startDate: string, endDate: string): number {
  return diffDays(startDate, endDate) + 1;
}

/** Initials for an avatar: first letters of the first two words. */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? "")
    .join("");
}
