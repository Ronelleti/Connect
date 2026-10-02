import { addDays } from "./dates";
import { formatHours, runsOnWeekday, shiftHours, shiftWindow, weekDates, weekdayOf } from "./shiftTime";
import type { Assignment, AvailabilityEntry, Issue, Person, ShiftTemplate, Validation } from "./types";

/** Less rest than this between two shifts is never allowed. */
export const MIN_REST_HOURS = 8;

type ShiftLike = Pick<Assignment, "workDate" | "startsAt" | "endsAt">;

export function assignmentHours(shift: ShiftLike): number {
  return shiftHours(shift.startsAt, shift.endsAt);
}

/** Hours each person works in the given shifts. */
export function hoursByUser(assignments: (ShiftLike & { userId: string })[]): Map<string, number> {
  const hours = new Map<string, number>();
  for (const assignment of assignments) {
    hours.set(assignment.userId, (hours.get(assignment.userId) ?? 0) + assignmentHours(assignment));
  }
  return hours;
}

/** Hours of rest between two shifts; negative when they overlap. */
export function restBetween(first: ShiftLike, second: ShiftLike): number {
  const reference = first.workDate < second.workDate ? first.workDate : second.workDate;
  const a = shiftWindow(reference, first.workDate, first.startsAt, first.endsAt);
  const b = shiftWindow(reference, second.workDate, second.startsAt, second.endsAt);
  if (a.start < b.end && b.start < a.end) {
    return -1;
  }
  return (a.end <= b.start ? b.start - a.end : a.start - b.end) / 60;
}

export function availabilityFor(
  entries: AvailabilityEntry[],
  userId: string,
  workDate: string,
  shiftTemplateId: string
) {
  const own = entries.filter((entry) => entry.userId === userId && entry.workDate === workDate);
  return {
    dayOff: own.find((entry) => entry.shiftTemplateId === null && entry.status === "TIME_OFF") ?? null,
    dayUnavailable: own.find((entry) => entry.shiftTemplateId === null && entry.status === "UNAVAILABLE") ?? null,
    shift: own.find((entry) => entry.shiftTemplateId === shiftTemplateId) ?? null
  };
}

export interface AssignmentCandidate {
  userId: string;
  template: ShiftTemplate;
  workDate: string;
}

/**
 * Checks one assignment. Errors block it; warnings need the scheduler's confirmation.
 * `userAssignments` are the person's other shifts around that week (any team), and
 * `weekStart` decides which of them count toward the weekly hour limit.
 */
export function validateAssignment(
  candidate: AssignmentCandidate,
  person: Pick<Person, "id" | "name" | "isActive" | "weeklyMaxHours">,
  userAssignments: Assignment[],
  availability: AvailabilityEntry[],
  weekStart: string
): Validation {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const { template, workDate } = candidate;
  const shift = { workDate, startsAt: template.startsAt, endsAt: template.endsAt };
  const own = userAssignments.filter((assignment) => assignment.userId === candidate.userId);

  if (!person.isActive) {
    errors.push({ code: "INACTIVE", message: `${person.name} אינו/ה פעיל/ה.` });
  }
  if (!template.isActive) {
    errors.push({ code: "SHIFT_ARCHIVED", message: "המשמרת הזו הועברה לארכיון." });
  } else if (!runsOnWeekday(template.weekdays, weekdayOf(workDate))) {
    errors.push({ code: "SHIFT_NOT_RUNNING", message: `המשמרת "${template.name}" לא פועלת ביום הזה.` });
  }
  if (own.some((assignment) => assignment.workDate === workDate && assignment.shiftTemplateId === template.id)) {
    errors.push({ code: "DUPLICATE", message: `${person.name} כבר משובץ/ת למשמרת הזו.` });
  }

  for (const other of own) {
    if (other.workDate === workDate && other.shiftTemplateId === template.id) {
      continue;
    }
    const rest = restBetween(other, shift);
    if (rest < 0) {
      errors.push({ code: "OVERLAP", message: `${person.name} כבר עובד/ת בשעות האלה (${other.startsAt}-${other.endsAt}).` });
    } else if (rest < MIN_REST_HOURS) {
      errors.push({
        code: "REST",
        message: `${person.name} יקבל/תקבל רק ${formatHours(rest)} שעות מנוחה בין משמרות (נדרשות לפחות ${MIN_REST_HOURS}).`
      });
    }
  }

  const weekEnd = addDays(weekStart, 7);
  const weekHours = own
    .filter((assignment) => assignment.workDate >= weekStart && assignment.workDate < weekEnd)
    .reduce((sum, assignment) => sum + assignmentHours(assignment), 0);
  const hoursAfter = weekHours + assignmentHours(shift);
  if (hoursAfter > person.weeklyMaxHours) {
    warnings.push({
      code: "WEEKLY_HOURS",
      message: `${person.name} יגיע/תגיע ל-${formatHours(hoursAfter)} שעות השבוע (המקסימום ${person.weeklyMaxHours}).`
    });
  }

  const { dayOff, dayUnavailable, shift: shiftEntry } = availabilityFor(availability, candidate.userId, workDate, template.id);
  if (dayOff) {
    warnings.push({ code: "TIME_OFF", message: `${person.name} ביום חופש בתאריך הזה.` });
  } else if (dayUnavailable || shiftEntry?.status === "UNAVAILABLE") {
    warnings.push({ code: "UNAVAILABLE", message: `${person.name} סימן/ה שאינו/ה זמין/ה למשמרת הזו.` });
  }

  return { errors: unique(errors), warnings: unique(warnings) };
}

export type CoverageStatus = "closed" | "empty" | "under" | "full" | "over";

export interface CoverageCell {
  templateId: string;
  workDate: string;
  required: number;
  assigned: number;
  status: CoverageStatus;
}

/** Staffed vs. needed for every shift on every day of the week. */
export function weekCoverage(weekStart: string, templates: ShiftTemplate[], assignments: Assignment[]): CoverageCell[] {
  const counts = new Map<string, number>();
  for (const assignment of assignments) {
    const key = `${assignment.shiftTemplateId}|${assignment.workDate}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const cells: CoverageCell[] = [];
  for (const template of templates) {
    for (const workDate of weekDates(weekStart)) {
      const runs = template.isActive && runsOnWeekday(template.weekdays, weekdayOf(workDate));
      const assigned = counts.get(`${template.id}|${workDate}`) ?? 0;
      const required = runs ? template.requiredCount : 0;
      cells.push({ templateId: template.id, workDate, required, assigned, status: coverageStatus(runs, required, assigned) });
    }
  }
  return cells;
}

function coverageStatus(runs: boolean, required: number, assigned: number): CoverageStatus {
  if (!runs && assigned === 0) {
    return "closed";
  }
  if (assigned === 0 && required > 0) {
    return "empty";
  }
  if (assigned < required) {
    return "under";
  }
  return assigned > required ? "over" : "full";
}

/** Required positions filled, counting each shift up to its target (overstaffing doesn't offset gaps). */
export function coverageTotals(cells: CoverageCell[]) {
  let required = 0;
  let filled = 0;
  let openSlots = 0;
  let understaffedShifts = 0;
  for (const cell of cells) {
    required += cell.required;
    filled += Math.min(cell.assigned, cell.required);
    if (cell.assigned < cell.required) {
      openSlots += cell.required - cell.assigned;
      understaffedShifts += 1;
    }
  }
  return {
    required,
    filled,
    openSlots,
    understaffedShifts,
    percent: required === 0 ? 100 : Math.round((filled / required) * 100)
  };
}

export interface AutoScheduleInput {
  weekStart: string;
  templates: ShiftTemplate[];
  members: Pick<Person, "id" | "name" | "isActive" | "weeklyMinHours" | "weeklyMaxHours">[];
  /** Every assignment of the team's members from the day before the week to the day after (any team). */
  assignments: Assignment[];
  availability: AvailabilityEntry[];
}

export interface AutoScheduleResult {
  created: { userId: string; shiftTemplateId: string; workDate: string }[];
  unfilled: { shiftTemplateId: string; workDate: string; missing: number }[];
}

/**
 * Fills every shift of the week up to its required headcount, only into empty positions
 * (existing assignments are kept). For each position it picks, among the members who are
 * free, rested (8h), not on time off or unavailable, not already working that day and
 * still under their weekly maximum: people who prefer that shift first, then whoever is
 * furthest below their weekly minimum, then whoever has the fewest hours.
 */
export function autoSchedule(input: AutoScheduleInput): AutoScheduleResult {
  const { weekStart, templates, availability } = input;
  const members = input.members.filter((member) => member.isActive);
  const weekEnd = addDays(weekStart, 7);
  const working: Assignment[] = [...input.assignments];
  const created: AutoScheduleResult["created"] = [];
  const unfilled: AutoScheduleResult["unfilled"] = [];

  const weekHours = new Map<string, number>();
  for (const member of members) {
    weekHours.set(member.id, 0);
  }
  for (const assignment of working) {
    if (assignment.workDate >= weekStart && assignment.workDate < weekEnd && weekHours.has(assignment.userId)) {
      weekHours.set(assignment.userId, (weekHours.get(assignment.userId) ?? 0) + assignmentHours(assignment));
    }
  }

  const ordered = [...templates]
    .filter((template) => template.isActive)
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt) || left.sortOrder - right.sortOrder);

  for (const workDate of weekDates(weekStart)) {
    for (const template of ordered) {
      if (!runsOnWeekday(template.weekdays, weekdayOf(workDate))) {
        continue;
      }
      const shift = { workDate, startsAt: template.startsAt, endsAt: template.endsAt };
      const hours = assignmentHours(shift);
      let missing =
        template.requiredCount -
        working.filter((assignment) => assignment.shiftTemplateId === template.id && assignment.workDate === workDate).length;

      while (missing > 0) {
        const candidates = members
          .filter((member) => {
            const own = working.filter((assignment) => assignment.userId === member.id);
            if (own.some((assignment) => assignment.workDate === workDate)) {
              return false;
            }
            if (own.some((assignment) => restBetween(assignment, shift) < MIN_REST_HOURS)) {
              return false;
            }
            if ((weekHours.get(member.id) ?? 0) + hours > member.weeklyMaxHours) {
              return false;
            }
            const entry = availabilityFor(availability, member.id, workDate, template.id);
            return !entry.dayOff && !entry.dayUnavailable && entry.shift?.status !== "UNAVAILABLE";
          })
          .map((member) => {
            const current = weekHours.get(member.id) ?? 0;
            return {
              member,
              prefers: availabilityFor(availability, member.id, workDate, template.id).shift?.status === "PREFERRED",
              belowMinimum: Math.max(0, member.weeklyMinHours - current),
              load: current / member.weeklyMaxHours
            };
          })
          .sort(
            (left, right) =>
              Number(right.prefers) - Number(left.prefers) ||
              right.belowMinimum - left.belowMinimum ||
              left.load - right.load ||
              left.member.id.localeCompare(right.member.id)
          );

        const chosen = candidates[0]?.member;
        if (!chosen) {
          unfilled.push({ shiftTemplateId: template.id, workDate, missing });
          break;
        }
        working.push({
          id: `auto-${created.length}`,
          userId: chosen.id,
          shiftTemplateId: template.id,
          teamId: template.teamId,
          ...shift
        });
        weekHours.set(chosen.id, (weekHours.get(chosen.id) ?? 0) + hours);
        created.push({ userId: chosen.id, shiftTemplateId: template.id, workDate });
        missing -= 1;
      }
    }
  }

  return { created, unfilled };
}

function unique(issues: Issue[]): Issue[] {
  return Array.from(new Map(issues.map((issue) => [issue.code, issue])).values());
}
