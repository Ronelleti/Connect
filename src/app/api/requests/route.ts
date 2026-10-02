import { NextResponse } from "next/server";
import { addDays, getScheduleTimeParts } from "@/lib/dates";
import { isSchedulable, teamsWithPermission } from "@/lib/permissions";
import { asActor, loadOrg } from "@/server/access";
import { isApiError, requireApiUser } from "@/server/api";
import { listShiftTemplates } from "@/server/org";
import { listPeople } from "@/server/people";
import { listGiveaways, listSwaps, listVacations } from "@/server/requests";
import { listNamedUserAssignments, listTeamAssignments } from "@/server/schedule";

// Everything for the Requests page: the person's swaps, the team's giveaway board,
// vacation requests, what waits for their approval, and the shifts they can offer.
export async function GET() {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  const { teams } = await loadOrg();
  const approverTeamIds = teamsWithPermission(asActor(user), "requests.approve", teams).map((team) => team.id);
  const today = getScheduleTimeParts().dateOnly;
  const horizon = addDays(today, 42);
  const teamIds = user.teamId ? [user.teamId] : [];

  const [swaps, giveaways, vacations, myShifts, teammates, teamAssignments, templates] = await Promise.all([
    listSwaps(user.id, approverTeamIds),
    listGiveaways(user.id, teamIds, approverTeamIds),
    listVacations(user.id, approverTeamIds),
    listNamedUserAssignments([user.id], today, horizon),
    listPeople({ teamIds }),
    listTeamAssignments(teamIds, today, horizon),
    listShiftTemplates(teamIds, true)
  ]);
  const shiftNames = new Map(templates.map((template) => [template.id, template.name]));

  return NextResponse.json({
    me: user.id,
    approverTeamIds,
    swaps,
    giveaways,
    vacations,
    myShifts,
    teammates: teammates
      .filter((person) => person.id !== user.id && isSchedulable(person.role))
      .map((person) => ({ id: person.id, name: person.name })),
    teammateShifts: teamAssignments
      .filter((assignment) => assignment.userId !== user.id)
      .map((assignment) => ({ ...assignment, shiftName: shiftNames.get(assignment.shiftTemplateId) ?? "משמרת" }))
  });
}
