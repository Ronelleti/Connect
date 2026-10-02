import { NextResponse } from "next/server";
import { isSundayDateOnly } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { autoSchedule } from "@/lib/scheduling";
import { asActor } from "@/server/access";
import { forbidden, isApiError, isUuid, jsonError, readJson, requireApiUser } from "@/server/api";
import { findTeam } from "@/server/org";
import { createAssignments } from "@/server/schedule";
import { loadTeamWeek } from "@/server/teamWeek";

// Fills the week's open positions automatically; existing assignments are kept.
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
  if (!can(asActor(user), "schedule.edit", team)) {
    return forbidden();
  }
  const weekStart = body.weekStart;
  const week = await loadTeamWeek(team, weekStart);
  const known = new Set(week.memberAssignments.map((assignment) => assignment.id));
  const plan = autoSchedule({
    weekStart,
    templates: week.templates.filter((template) => template.isActive),
    members: week.members,
    assignments: [...week.memberAssignments, ...week.teamAssignments.filter((assignment) => !known.has(assignment.id))],
    availability: week.availability
  });

  const templates = new Map(week.templates.map((template) => [template.id, template]));
  const created = await createAssignments(
    plan.created.map((item) => {
      const template = templates.get(item.shiftTemplateId)!;
      return { ...item, teamId: team.id, startsAt: template.startsAt, endsAt: template.endsAt };
    }),
    user.id
  );
  return NextResponse.json({ created: created.length, unfilled: plan.unfilled });
}
