import { NextResponse } from "next/server";
import { addDays, getSundayWeekStart } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { validateAssignment } from "@/lib/scheduling";
import { asActor } from "@/server/access";
import { forbidden, isApiError, isDateOnly, isUuid, jsonError, readJson, requireApiUser } from "@/server/api";
import { findShiftTemplate, findTeam } from "@/server/org";
import { findPerson } from "@/server/people";
import { createAssignments, listAvailability, listUserAssignments } from "@/server/schedule";

// Puts a team member on a shift. Errors (overlap, too little rest, ...) block it; warnings
// (time off, over the weekly hours, ...) are returned with 409 until the scheduler confirms
// with acknowledgeWarnings.
export async function POST(request: Request) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  const body = await readJson(request);
  if (!isUuid(body.userId) || !isUuid(body.shiftTemplateId) || !isDateOnly(body.workDate)) {
    return jsonError("חסרים פרטי שיבוץ.");
  }
  const [template, person] = await Promise.all([findShiftTemplate(body.shiftTemplateId), findPerson(body.userId)]);
  const team = template ? await findTeam(template.teamId) : null;
  if (!template || !team || !person) {
    return jsonError("המשמרת או העובד/ת לא נמצאו.", 404);
  }
  if (!can(asActor(user), "schedule.edit", team)) {
    return forbidden();
  }
  // Team members, plus experts from any team, can be scheduled here.
  if (person.teamId !== team.id && person.role !== "EXPERT") {
    return jsonError(`${person.name} לא שייך/ת לצוות ${team.name}.`);
  }

  const workDate = body.workDate;
  const weekStart = getSundayWeekStart(new Date(`${workDate}T12:00:00.000Z`));
  const [userAssignments, availability] = await Promise.all([
    listUserAssignments([person.id], addDays(weekStart, -1), addDays(weekStart, 8)),
    listAvailability([person.id], workDate, addDays(workDate, 1))
  ]);
  const validation = validateAssignment({ userId: person.id, template, workDate }, person, userAssignments, availability, weekStart);
  if (validation.errors.length > 0) {
    return jsonError(validation.errors[0].message, 422, validation);
  }
  if (validation.warnings.length > 0 && body.acknowledgeWarnings !== true) {
    return jsonError("נדרש אישור לשיבוץ.", 409, validation);
  }

  const [assignment] = await createAssignments(
    [{ userId: person.id, shiftTemplateId: template.id, teamId: team.id, workDate, startsAt: template.startsAt, endsAt: template.endsAt }],
    user.id
  );
  if (!assignment) {
    return jsonError(`${person.name} כבר משובץ/ת למשמרת הזו.`, 409);
  }
  return NextResponse.json({ assignment, warnings: validation.warnings }, { status: 201 });
}
