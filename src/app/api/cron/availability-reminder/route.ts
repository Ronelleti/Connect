import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  addDays,
  formatHebrewDate,
  getAvailabilityWeekStart,
  getScheduleTimeParts,
  getSundayWeekStart
} from "@/lib/dates";
import { jsonError } from "@/server/api";
import { notifyUsers } from "@/server/notifications";
import { listUserIdsMissingAvailability } from "@/server/requests";

// Availability for the week two weeks ahead is due on Tuesday of the current week.
const DEADLINE_DAY_INDEX = 2;

// Called every Sunday by the Netlify scheduled function in
// netlify/functions/availability-reminder.mts. Requires CRON_SECRET; without it the
// endpoint refuses every call rather than being open to anyone.
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const provided = request.headers.get("x-cron-secret") ?? "";
  if (!secret || !safeEqual(provided, secret)) {
    return jsonError("Forbidden.", 403);
  }

  const now = new Date();
  const weekStart = getAvailabilityWeekStart(now);
  const deadline = addDays(getSundayWeekStart(now), DEADLINE_DAY_INDEX);
  const userIds = await listUserIdsMissingAvailability(weekStart);
  // A manual mid-week run shouldn't mention a deadline that already passed.
  const deadlineText =
    deadline >= getScheduleTimeParts(now).dateOnly
      ? ` יש למלא עד יום שלישי ${formatHebrewDate(deadline)}.`
      : "";

  await notifyUsers(userIds, {
    title: "תזכורת: מילוי אילוצים",
    body: `עוד לא מילאת אילוצים לשבוע ${formatHebrewDate(weekStart)}-${formatHebrewDate(
      addDays(weekStart, 6)
    )}.${deadlineText}`,
    link: "/schedule#availability-section"
  });

  return NextResponse.json({ weekStart, reminded: userIds.length });
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
