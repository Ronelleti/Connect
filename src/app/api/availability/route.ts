import { NextResponse } from "next/server";
import { addDays, getAvailabilityWeekStart, getScheduleTimeParts, getSundayWeekStart, isSundayDateOnly } from "@/lib/dates";
import type { AvailabilityStatus } from "@/lib/types";
import { isApiError, isDateOnly, isUuid, jsonError, readJson, requireApiUser } from "@/server/api";
import { findShiftTemplate, listShiftTemplates } from "@/server/org";
import {
  isAvailabilitySubmitted,
  listAvailability,
  listUserAssignments,
  markAvailabilitySubmitted,
  setAvailability
} from "@/server/schedule";

const STATUSES: AvailabilityStatus[] = ["UNAVAILABLE", "PREFERRED", "TIME_OFF"];

// The signed-in person's own availability for a week (by default the week that is open
// for filling in, two weeks ahead) and their team's shifts.
export async function GET(request: Request) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  const openWeek = getAvailabilityWeekStart();
  const weekStart = new URL(request.url).searchParams.get("week") ?? openWeek;
  if (!isSundayDateOnly(weekStart)) {
    return jsonError("שבוע לא תקין.");
  }
  const weekEnd = addDays(weekStart, 7);
  const [templates, entries, assignments, submitted] = await Promise.all([
    user.teamId ? listShiftTemplates([user.teamId]) : Promise.resolve([]),
    listAvailability([user.id], weekStart, weekEnd),
    listUserAssignments([user.id], weekStart, weekEnd),
    isAvailabilitySubmitted(user.id, weekStart)
  ]);
  return NextResponse.json({ weekStart, openWeek, templates, entries, assignments, submitted });
}

// Sets or clears one entry: { workDate, shiftTemplateId (null = whole day), status (null = clear) }.
export async function PUT(request: Request) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  const body = await readJson(request);
  if (!isDateOnly(body.workDate)) {
    return jsonError("תאריך לא תקין.");
  }
  if (body.workDate < getScheduleTimeParts().dateOnly) {
    return jsonError("אי אפשר לשנות זמינות לתאריך שעבר.");
  }
  const status = body.status === null ? null : (body.status as AvailabilityStatus);
  if (status !== null && !STATUSES.includes(status)) {
    return jsonError("סטטוס לא תקין.");
  }
  let shiftTemplateId: string | null = null;
  if (body.shiftTemplateId != null) {
    const template = isUuid(body.shiftTemplateId) ? await findShiftTemplate(body.shiftTemplateId) : null;
    if (!template || template.teamId !== user.teamId) {
      return jsonError("המשמרת לא שייכת לצוות שלך.");
    }
    if (status === "TIME_OFF") {
      return jsonError("יום חופש מסמנים על היום כולו.");
    }
    shiftTemplateId = template.id;
  }
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 200) : "";
  await setAvailability({ userId: user.id, workDate: body.workDate, shiftTemplateId, status, note });
  // Changing anything counts as filling in that week (the Sunday reminder skips them).
  await markAvailabilitySubmitted(user.id, getSundayWeekStart(new Date(`${body.workDate}T12:00:00.000Z`)));
  return NextResponse.json({ ok: true });
}
