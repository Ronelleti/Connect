import { NextResponse } from "next/server";
import { addDays, getAvailabilityWeekStart, getScheduleMonthRange, getScheduleTimeParts, getSundayWeekStart } from "@/lib/dates";
import { teamsWithPermission } from "@/lib/permissions";
import { assignmentHours } from "@/lib/scheduling";
import { shiftWindow } from "@/lib/shiftTime";
import { asActor, loadOrg } from "@/server/access";
import { isApiError, requireApiUser } from "@/server/api";
import { query } from "@/server/db";
import { findPerson, listPeople } from "@/server/people";
import { isAvailabilitySubmitted, listNamedUserAssignments, listPublishedWeeks, listTeamAssignments } from "@/server/schedule";

// The home screen: my week, my next shift, my hours, who is on shift now in my team, and
// what is waiting for me.
export async function GET() {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  const now = new Date();
  const { dateOnly: today, hour } = getScheduleTimeParts(now);
  const minuteNow = hour * 60 + Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", minute: "2-digit" }).format(now));
  const weekStart = getSundayWeekStart(now);
  const month = getScheduleMonthRange(now);
  const openWeek = getAvailabilityWeekStart(now);
  const { teams } = await loadOrg();
  const approverTeamIds = teamsWithPermission(asActor(user), "requests.approve", teams).map((team) => team.id);

  const [person, upcoming, monthShifts, submitted, waiting, approvals, openGiveaways] = await Promise.all([
    findPerson(user.id),
    listNamedUserAssignments([user.id], addDays(weekStart, -1), addDays(weekStart, 14)),
    listNamedUserAssignments([user.id], month.monthStart, month.monthEnd),
    isAvailabilitySubmitted(user.id, openWeek),
    query<{ count: number }>(
      "SELECT count(*)::int AS count FROM swap_requests WHERE target_user_id = $1 AND status = 'PENDING_EMPLOYEE'",
      [user.id]
    ),
    query<{ count: number }>(
      `SELECT
         (SELECT count(*) FROM swap_requests WHERE team_id = ANY($1::uuid[]) AND status = 'PENDING_MANAGER') +
         (SELECT count(*) FROM shift_giveaways WHERE team_id = ANY($1::uuid[]) AND status = 'PENDING_MANAGER') +
         (SELECT count(*) FROM vacation_requests v JOIN users u ON u.id = v.user_id
            WHERE u.team_id = ANY($1::uuid[]) AND v.status = 'PENDING') AS count`,
      [approverTeamIds]
    ),
    user.teamId
      ? query<{ count: number }>(
          `SELECT count(*)::int AS count FROM shift_giveaways g JOIN shift_assignments a ON a.id = g.assignment_id
           WHERE g.team_id = $1 AND g.status = 'OPEN' AND g.offered_by <> $2 AND a.work_date >= $3`,
          [user.teamId, user.id, today]
        )
      : Promise.resolve([{ count: 0 }])
  ]);

  const thisWeek = upcoming.filter((shift) => shift.workDate >= weekStart && shift.workDate < addDays(weekStart, 7));
  const nextShift =
    upcoming.find((shift) => shiftWindow(today, shift.workDate, shift.startsAt, shift.endsAt).end > minuteNow) ?? null;

  // Who in my team is working right now.
  let onShiftNow: { userId: string; name: string; startsAt: string; endsAt: string }[] = [];
  let teamPublished = false;
  if (user.teamId) {
    const [teamShifts, members, published] = await Promise.all([
      listTeamAssignments([user.teamId], addDays(today, -1), addDays(today, 1)),
      listPeople({ teamIds: [user.teamId] }),
      listPublishedWeeks([user.teamId], weekStart)
    ]);
    const names = new Map(members.map((member) => [member.id, member.name]));
    onShiftNow = teamShifts
      .filter((shift) => {
        const window = shiftWindow(today, shift.workDate, shift.startsAt, shift.endsAt);
        return window.start <= minuteNow && minuteNow < window.end;
      })
      .map((shift) => ({ userId: shift.userId, name: names.get(shift.userId) ?? "", startsAt: shift.startsAt, endsAt: shift.endsAt }));
    teamPublished = published.has(user.teamId);
  }

  return NextResponse.json({
    today,
    weekStart,
    openWeek,
    availabilitySubmitted: submitted,
    thisWeek,
    nextShift,
    weekHours: thisWeek.reduce((sum, shift) => sum + assignmentHours(shift), 0),
    monthHours: monthShifts.reduce((sum, shift) => sum + assignmentHours(shift), 0),
    monthShifts: monthShifts.length,
    weeklyMaxHours: person?.weeklyMaxHours ?? 0,
    weeklyMinHours: person?.weeklyMinHours ?? 0,
    swapsWaitingForMe: waiting[0]?.count ?? 0,
    approvalsWaiting: Number(approvals[0]?.count ?? 0),
    openGiveaways: openGiveaways[0]?.count ?? 0,
    onShiftNow,
    teamPublished
  });
}
