import { addDays, diffDays } from "./dates";

const MINUTES_PER_DAY = 24 * 60;

/** "08:30" or "08:30:00" -> minutes after midnight. */
export function parseTime(value: string): number {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid time "${value}"`);
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    throw new Error(`Invalid time "${value}"`);
  }
  return hours * 60 + minutes;
}

export function isValidTime(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  try {
    parseTime(value);
    return true;
  } catch {
    return false;
  }
}

/** Normalizes a database TIME ("08:30:00") to "08:30". */
export function normalizeTime(value: string): string {
  const minutes = parseTime(value);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Length of a shift in minutes; an end at or before the start means it ends the next day. */
export function shiftMinutes(startsAt: string, endsAt: string): number {
  const start = parseTime(startsAt);
  const end = parseTime(endsAt);
  return end > start ? end - start : end + MINUTES_PER_DAY - start;
}

export function shiftHours(startsAt: string, endsAt: string): number {
  return Math.round((shiftMinutes(startsAt, endsAt) / 60) * 100) / 100;
}

export function formatHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

export function timeRangeLabel(startsAt: string, endsAt: string): string {
  return `${normalizeTime(startsAt)}-${normalizeTime(endsAt)}`;
}

/** 0 = Sunday ... 6 = Saturday, for a "YYYY-MM-DD" date. */
export function weekdayOf(dateOnly: string): number {
  return new Date(`${dateOnly}T00:00:00.000Z`).getUTCDay();
}

export function runsOnWeekday(weekdays: number, weekday: number): boolean {
  return (weekdays & (1 << weekday)) !== 0;
}

export function weekdaysMask(days: number[]): number {
  return days.reduce((mask, day) => mask | (1 << day), 0);
}

export const ALL_WEEKDAYS = 127;

/**
 * A shift's start and end as minutes counted from a reference date (day 0 at 00:00).
 * Times are wall-clock, which is what rest rules are about.
 */
export function shiftWindow(referenceDate: string, workDate: string, startsAt: string, endsAt: string) {
  const start = diffDays(referenceDate, workDate) * MINUTES_PER_DAY + parseTime(startsAt);
  return { start, end: start + shiftMinutes(startsAt, endsAt) };
}

export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

/**
 * How many people work during each hour of the week: [day][hour], Sunday first. A person
 * counts in an hour if they work any part of it. Shifts that started the day before the
 * week (Saturday night) count for the hours they reach into Sunday.
 */
export function hourlyLoad(
  weekStart: string,
  shifts: { workDate: string; startsAt: string; endsAt: string }[]
): number[][] {
  const load = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  const weekEnd = 7 * MINUTES_PER_DAY;
  for (const shift of shifts) {
    const { start, end } = shiftWindow(weekStart, shift.workDate, shift.startsAt, shift.endsAt);
    const firstHour = Math.floor(Math.max(0, start) / 60);
    const endHour = Math.ceil(Math.min(weekEnd, end) / 60);
    for (let hour = firstHour; hour < endHour; hour += 1) {
      load[Math.floor(hour / 24)][hour % 24] += 1;
    }
  }
  return load;
}
