import { addDays } from "@/lib/dates";
import type { Team } from "@/lib/types";
import { listShiftTemplates } from "./org";
import { listPeople } from "./people";
import { listAvailability, listTeamAssignments, listUserAssignments } from "./schedule";

/** Everything needed to plan one team's week: its shifts, members, and their shifts around it. */
export async function loadTeamWeek(team: Team, weekStart: string) {
  const weekEnd = addDays(weekStart, 7);
  const [templates, members, teamAssignments] = await Promise.all([
    listShiftTemplates([team.id], true),
    listPeople({ teamIds: [team.id] }),
    listTeamAssignments([team.id], weekStart, weekEnd)
  ]);
  const schedulable = members.filter((member) => member.role === "EMPLOYEE" || member.role === "TEAM_LEAD");
  const memberIds = schedulable.map((member) => member.id);
  const [memberAssignments, availability] = await Promise.all([
    listUserAssignments(memberIds, addDays(weekStart, -1), addDays(weekEnd, 1)),
    listAvailability(memberIds, weekStart, weekEnd)
  ]);
  // Archived shifts only show up when they still have assignments this week.
  const usedTemplateIds = new Set(teamAssignments.map((assignment) => assignment.shiftTemplateId));
  return {
    templates: templates.filter((template) => template.isActive || usedTemplateIds.has(template.id)),
    members: schedulable,
    teamAssignments,
    memberAssignments,
    availability
  };
}
