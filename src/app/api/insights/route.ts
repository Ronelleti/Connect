import { NextResponse } from "next/server";
import { addDays, getSundayWeekStart, isSundayDateOnly } from "@/lib/dates";
import { buildInsights, TREND_WEEKS } from "@/lib/insights";
import { teamsWithPermission } from "@/lib/permissions";
import { asActor, loadOrg } from "@/server/access";
import { forbidden, isApiError, jsonError, requireApiUser } from "@/server/api";
import { query } from "@/server/db";
import { listShiftTemplates } from "@/server/org";
import { listPeople } from "@/server/people";
import { listAvailability, listTeamAssignments } from "@/server/schedule";

// Analytics for the teams where the person can view reports: one team or all of them.
export async function GET(request: Request) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  const { teams } = await loadOrg();
  const reportTeams = teamsWithPermission(asActor(user), "reports.view", teams);
  if (reportTeams.length === 0) {
    return forbidden();
  }
  const params = new URL(request.url).searchParams;
  const weekStart = params.get("week") ?? getSundayWeekStart();
  if (!isSundayDateOnly(weekStart)) {
    return jsonError("שבוע לא תקין.");
  }
  const teamParam = params.get("team");
  const selected = reportTeams.filter((team) => !teamParam || teamParam === "all" || team.id === teamParam);
  if (selected.length === 0) {
    return forbidden();
  }
  const teamIds = selected.map((team) => team.id);
  const weekEnd = addDays(weekStart, 7);

  const [templates, assignments, members, pending] = await Promise.all([
    listShiftTemplates(teamIds, true),
    listTeamAssignments(teamIds, addDays(weekStart, -7 * (TREND_WEEKS - 1) - 1), weekEnd),
    listPeople({ teamIds }),
    query<{ swaps: number; giveaways: number; vacations: number }>(
      `SELECT
         (SELECT count(*)::int FROM swap_requests WHERE team_id = ANY($1::uuid[]) AND status = 'PENDING_MANAGER') AS swaps,
         (SELECT count(*)::int FROM shift_giveaways WHERE team_id = ANY($1::uuid[]) AND status = 'PENDING_MANAGER') AS giveaways,
         (SELECT count(*)::int FROM vacation_requests v JOIN users u ON u.id = v.user_id
            WHERE u.team_id = ANY($1::uuid[]) AND v.status = 'PENDING') AS vacations`,
      [teamIds]
    )
  ]);
  const schedulable = members.filter((member) => member.role === "EMPLOYEE" || member.role === "TEAM_LEAD");
  const timeOff = await listAvailability(schedulable.map((member) => member.id), weekStart, weekEnd);
  const insights = buildInsights({
    weekStart,
    teams: selected,
    templates,
    assignments,
    members: schedulable,
    timeOffUserIds: new Set(timeOff.filter((entry) => entry.status === "TIME_OFF").map((entry) => entry.userId))
  });

  return NextResponse.json({
    weekStart,
    reportTeams,
    selectedTeamIds: teamIds,
    pending: pending[0] ?? { swaps: 0, giveaways: 0, vacations: 0 },
    ...insights
  });
}
