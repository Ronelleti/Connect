import { NextResponse } from "next/server";
import { diffDays, getScheduleTimeParts } from "@/lib/dates";
import { isApiError, isDateOnly, jsonError, readJson, requireApiUser } from "@/server/api";
import { findTeam } from "@/server/org";
import { notifyVacationRequested } from "@/server/requestNotifications";
import { createVacation } from "@/server/requests";

const MAX_VACATION_DAYS = 60;

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  const body = await readJson(request);
  if (!isDateOnly(body.startDate) || !isDateOnly(body.endDate) || body.endDate < body.startDate) {
    return jsonError("טווח התאריכים לא תקין.");
  }
  if (body.startDate < getScheduleTimeParts().dateOnly) {
    return jsonError("אפשר לבקש חופשה רק לתאריכים עתידיים.");
  }
  if (diffDays(body.startDate, body.endDate) + 1 > MAX_VACATION_DAYS) {
    return jsonError(`אפשר לבקש עד ${MAX_VACATION_DAYS} ימים בבקשה אחת.`);
  }
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : "";
  const vacation = await createVacation(user.id, body.startDate, body.endDate, note);
  if (vacation) {
    await notifyVacationRequested(vacation, user.teamId ? await findTeam(user.teamId) : null);
  }
  return NextResponse.json({ vacation }, { status: 201 });
}
