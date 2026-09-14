const DAY_MS = 24 * 60 * 60 * 1000;
const SCHEDULE_TIME_ZONE = "Asia/Jerusalem";

export interface ScheduleDay {
  index: number;
  label: string;
  date: string;
}

export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getSundayWeekStart(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SCHEDULE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const copy = new Date(Date.UTC(year, month - 1, day));
  copy.setUTCDate(copy.getUTCDate() - copy.getUTCDay());
  return toDateOnly(copy);
}

export function getAvailabilityWeekStart(date = new Date()): string {
  return addDays(getSundayWeekStart(date), 14);
}

export function addDays(dateOnly: string, days: number): string {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  return toDateOnly(new Date(date.getTime() + days * DAY_MS));
}

export function formatHebrewDate(dateOnly: string): string {
  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit"
  }).format(new Date(`${dateOnly}T00:00:00.000Z`));
}

export function getScheduleDays(weekStart: string): ScheduleDay[] {
  return ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"].map((label, index) => ({
    index,
    label,
    date: addDays(weekStart, index)
  }));
}
