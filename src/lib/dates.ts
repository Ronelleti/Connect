const DAY_MS = 24 * 60 * 60 * 1000;
export const SCHEDULE_TIME_ZONE = "Asia/Jerusalem";

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

export function diffDays(fromDateOnly: string, toDateOnly: string): number {
  const from = new Date(`${fromDateOnly}T00:00:00.000Z`).getTime();
  const to = new Date(`${toDateOnly}T00:00:00.000Z`).getTime();
  return Math.round((to - from) / DAY_MS);
}

export function getScheduleTimeParts(date = new Date()): { dateOnly: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SCHEDULE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  return { dateOnly: `${year}-${month}-${day}`, hour };
}

// Converts a wall-clock date/time as it would read on a clock in `timeZone` into the
// true UTC instant it represents, correctly accounting for that date's DST offset.
export function zonedTimeToUtc(
  dateOnly: string,
  hour: number,
  minute: number,
  timeZone: string = SCHEDULE_TIME_ZONE
): Date {
  const guess = new Date(`${dateOnly}T${pad(hour)}:${pad(minute)}:00.000Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(guess);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const displayedAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
  return new Date(guess.getTime() + (guess.getTime() - displayedAsUtc));
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function getScheduleMonthRange(date = new Date()): { monthStart: string; monthEnd: string } {
  const { dateOnly } = getScheduleTimeParts(date);
  const [year, month] = dateOnly.split("-").map(Number);
  return {
    monthStart: toDateOnly(new Date(Date.UTC(year, month - 1, 1))),
    monthEnd: toDateOnly(new Date(Date.UTC(year, month, 1)))
  };
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
