import { addDays } from "./dates";
import { assignmentHours, coverageTotals, weekCoverage } from "./scheduling";
import { hourlyLoad, weekDates } from "./shiftTime";
import type { Assignment, Person, ShiftTemplate, Team } from "./types";

export const TREND_WEEKS = 6;

export interface InsightsInput {
  weekStart: string;
  teams: Team[];
  templates: ShiftTemplate[];
  /** Assignments of the teams from TREND_WEEKS-1 weeks before the week through the week itself. */
  assignments: Assignment[];
  members: Pick<Person, "id" | "name" | "teamId" | "weeklyMinHours" | "weeklyMaxHours">[];
  /** People with a full day off (time off) on any day of the week. */
  timeOffUserIds: Set<string>;
}

export function buildInsights(input: InsightsInput) {
  const { weekStart, teams, templates, members } = input;
  const weekEnd = addDays(weekStart, 7);
  const weekAssignments = input.assignments.filter(
    (assignment) => assignment.workDate >= weekStart && assignment.workDate < weekEnd
  );
  const cells = weekCoverage(weekStart, templates, weekAssignments);
  const totals = coverageTotals(cells);
  const totalHours = weekAssignments.reduce((sum, assignment) => sum + assignmentHours(assignment), 0);

  const perTeam = teams.map((team) => {
    const teamTemplates = new Set(templates.filter((template) => template.teamId === team.id).map((template) => template.id));
    const teamTotals = coverageTotals(cells.filter((cell) => teamTemplates.has(cell.templateId)));
    const teamAssignments = weekAssignments.filter((assignment) => assignment.teamId === team.id);
    return {
      teamId: team.id,
      name: team.name,
      colorSlot: team.colorSlot,
      ...teamTotals,
      hours: round(teamAssignments.reduce((sum, assignment) => sum + assignmentHours(assignment), 0)),
      people: new Set(teamAssignments.map((assignment) => assignment.userId)).size
    };
  });

  const daily = weekDates(weekStart).map((date) => {
    const dayTotals = coverageTotals(cells.filter((cell) => cell.workDate === date));
    return { date, required: dayTotals.required, filled: dayTotals.filled, open: dayTotals.openSlots };
  });

  const people = members
    .map((member) => {
      const own = weekAssignments.filter((assignment) => assignment.userId === member.id);
      return {
        userId: member.id,
        name: member.name,
        teamId: member.teamId,
        hours: round(own.reduce((sum, assignment) => sum + assignmentHours(assignment), 0)),
        shifts: own.length,
        minHours: member.weeklyMinHours,
        maxHours: member.weeklyMaxHours
      };
    })
    .sort((left, right) => right.hours - left.hours || left.name.localeCompare(right.name, "he"));

  const trend = Array.from({ length: TREND_WEEKS }, (_, index) => {
    const start = addDays(weekStart, (index - (TREND_WEEKS - 1)) * 7);
    const end = addDays(start, 7);
    const weekCells = weekCoverage(
      start,
      templates,
      input.assignments.filter((assignment) => assignment.workDate >= start && assignment.workDate < end)
    );
    return { weekStart: start, percent: coverageTotals(weekCells).percent };
  });

  return {
    kpis: {
      coveragePercent: totals.percent,
      required: totals.required,
      filled: totals.filled,
      openSlots: totals.openSlots,
      understaffedShifts: totals.understaffedShifts,
      scheduledPeople: new Set(weekAssignments.map((assignment) => assignment.userId)).size,
      totalHours: round(totalHours),
      timeOffPeople: members.filter((member) => input.timeOffUserIds.has(member.id)).length
    },
    teams: perTeam,
    daily,
    hourly: hourlyLoad(weekStart, input.assignments.filter((assignment) => assignment.workDate >= addDays(weekStart, -1) && assignment.workDate < weekEnd)),
    people,
    trend,
    peopleOutsideLimits: people.filter((person) => person.hours > person.maxHours || person.hours < person.minHours).length
  };
}

export type Insights = ReturnType<typeof buildInsights>;

function round(value: number) {
  return Math.round(value * 10) / 10;
}
