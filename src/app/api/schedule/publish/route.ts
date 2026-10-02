import { NextResponse } from "next/server";
import { addDays, isSundayDateOnly } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { buildSchedulePublishedMessage } from "@/lib/schedulePublish";
import { asActor } from "@/server/access";
import { forbidden, isApiError, isUuid, jsonError, readJson, requireApiUser } from "@/server/api";
import { notifyUsers } from "@/server/notifications";
import { findTeam, listShiftTemplates } from "@/server/org";
import { listPeople } from "@/server/people";
import { listTeamAssignments, recordPublishedWeek } from "@/server/schedule";

// Marks the team's week as ready and notifies every active member (bell + phone) with
// their own shifts. Publishing again sends an "updated" notification.
export async function POST(request: Request) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  const body = await readJson(request);
  const team = isUuid(body.teamId) ? await findTeam(body.teamId) : null;
  if (!team || typeof body.weekStart !== "string" || !isSundayDateOnly(body.weekStart)) {
    return jsonError("יש לבחור צוות ושבוע.");
  }
  if (!can(asActor(user), "schedule.publish", team)) {
    return forbidden();
  }
  const weekStart = body.weekStart;
  const { publishedAt, wasPublished } = await recordPublishedWeek(team.id, weekStart, user.id);
  const [members, assignments, templates] = await Promise.all([
    listPeople({ teamIds: [team.id] }),
    listTeamAssignments([team.id], weekStart, addDays(weekStart, 7)),
    listShiftTemplates([team.id], true)
  ]);
  const names = new Map(templates.map((template) => [template.id, template.name]));
  const recipients = members.filter((member) => member.role === "EMPLOYEE" || member.role === "TEAM_LEAD");
  await Promise.all(
    recipients.map((member) =>
      notifyUsers(
        [member.id],
        buildSchedulePublishedMessage(
          weekStart,
          team.id,
          team.name,
          assignments
            .filter((assignment) => assignment.userId === member.id)
            .map((assignment) => ({ ...assignment, shiftName: names.get(assignment.shiftTemplateId) ?? "משמרת" })),
          wasPublished
        )
      )
    )
  );
  return NextResponse.json({ publishedAt, wasPublished, notified: recipients.length });
}
