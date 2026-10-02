import { NextResponse } from "next/server";
import { addDays, getSundayWeekStart, isSundayDateOnly } from "@/lib/dates";
import { can, visibleTeams } from "@/lib/permissions";
import { asActor, loadOrg } from "@/server/access";
import { forbidden, isApiError, jsonError, requireApiUser } from "@/server/api";
import { listApprovedVacations } from "@/server/requests";
import { listPublishedWeeks } from "@/server/schedule";
import { loadTeamWeek } from "@/server/teamWeek";

// One team's week. Schedulers also get the members' availability and their shifts in
// other teams (to see who is busy); everyone else sees only their own availability.
export async function GET(request: Request) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  const actor = asActor(user);
  const params = new URL(request.url).searchParams;
  const weekStart = params.get("week") ?? getSundayWeekStart();
  if (!isSundayDateOnly(weekStart)) {
    return jsonError("שבוע לא תקין.");
  }
  const { teams } = await loadOrg();
  const visible = visibleTeams(actor, teams);
  const team = visible.find((candidate) => candidate.id === (params.get("team") ?? user.teamId)) ?? visible[0];
  if (!team) {
    return forbidden("אין צוות להצגה.");
  }

  const canEdit = can(actor, "schedule.edit", team);
  const [week, published, vacations] = await Promise.all([
    loadTeamWeek(team, weekStart),
    listPublishedWeeks([team.id], weekStart),
    listApprovedVacations([team.id], weekStart, addDays(weekStart, 7))
  ]);

  return NextResponse.json({
    weekStart,
    team,
    templates: week.templates,
    members: week.members.map((member) => ({
      id: member.id,
      name: member.name,
      role: member.role,
      title: member.title,
      weeklyMinHours: canEdit ? member.weeklyMinHours : 0,
      weeklyMaxHours: canEdit ? member.weeklyMaxHours : 0
    })),
    assignments: week.teamAssignments,
    // Members' shifts outside this team/week (other teams, the days around the week), so
    // the planner can show who is busy and check rest times.
    otherAssignments: canEdit
      ? week.memberAssignments.filter((assignment) => !week.teamAssignments.some((own) => own.id === assignment.id))
      : [],
    availability: canEdit ? week.availability : week.availability.filter((entry) => entry.userId === user.id),
    vacations: vacations.map((vacation) => ({
      userId: vacation.userId,
      startDate: vacation.startDate,
      endDate: vacation.endDate
    })),
    publishedAt: published.get(team.id) ?? null,
    canEdit,
    canPublish: can(actor, "schedule.publish", team)
  });
}
