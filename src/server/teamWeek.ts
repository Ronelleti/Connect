import { addDays } from "@/lib/dates";
import { isSchedulable } from "@/lib/permissions";
import type { Team } from "@/lib/types";
import { listShiftTemplates } from "./org";
import { listPeople } from "./people";
import { listAvailability, listTeamAssignments, listUserAssignments } from "./schedule";

/**
 * Everything needed to plan one team's week: its shifts, its members, the experts from
 * other teams who can also be scheduled here ("guests"), and everyone's shifts and
 * availability around the week (in any team, for rest and overlap checks).
 */
export async function loadTeamWeek(team: Team, weekStart: string) {
  const weekEnd = addDays(weekStart, 7);
  const [templates, everyone, teamAssignments] = await Promise.all([
    listShiftTemplates([team.id], true),
    listPeople({}),
    listTeamAssignments([team.id], weekStart, weekEnd)
  ]);
  const members = everyone.filter((person) => person.teamId === team.id && isSchedulable(person.role));
  const guests = everyone.filter((person) => person.role === "EXPERT" && person.teamId !== team.id);
  const ids = [...members, ...guests].map((person) => person.id);
  const [memberAssignments, availability] = await Promise.all([
    listUserAssignments(ids, addDays(weekStart, -1), addDays(weekEnd, 1)),
    listAvailability(ids, weekStart, weekEnd)
  ]);
  // Archived shifts only show up when they still have assignments this week.
  const usedTemplateIds = new Set(teamAssignments.map((assignment) => assignment.shiftTemplateId));
  return {
    templates: templates.filter((template) => template.isActive || usedTemplateIds.has(template.id)),
    members,
    guests,
    teamAssignments,
    memberAssignments,
    availability
  };
}
