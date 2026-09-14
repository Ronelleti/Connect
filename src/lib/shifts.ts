import { addDays, diffDays, getScheduleTimeParts, getSundayWeekStart } from "./dates";
import type {
  AssignmentInput,
  AssignmentIssue,
  AssignmentValidation,
  AvailabilityBlock,
  Employee,
  EmployeeSummary,
  ShiftAssignment,
  ShiftType
} from "./types";

export const SHIFT_DEFINITIONS: Record<
  ShiftType,
  {
    label: string;
    startsAt: string;
    endsAt: string;
    hours: number;
    tone: string;
    color: { solid: string; soft: string };
  }
> = {
  MORNING: {
    label: "בוקר",
    startsAt: "07:00",
    endsAt: "15:00",
    hours: 8,
    tone: "morning",
    color: { solid: "#4d8149", soft: "#eff7ed" }
  },
  EVENING: {
    label: "ערב",
    startsAt: "15:00",
    endsAt: "23:00",
    hours: 8,
    tone: "evening",
    color: { solid: "#a57806", soft: "#fff8e5" }
  },
  NIGHT: {
    label: "לילה",
    startsAt: "23:00",
    endsAt: "07:00",
    hours: 8,
    tone: "night",
    color: { solid: "#b91820", soft: "#fff1f2" }
  }
};

const SHIFT_ORDER: ShiftType[] = ["MORNING", "EVENING", "NIGHT"];
export const MAX_WEEKLY_SHIFTS = 6;
const MIN_REST_HOURS = 8;

export function getShiftTypes(): ShiftType[] {
  return SHIFT_ORDER;
}

export function getCurrentShiftSlot(date = new Date()): {
  weekStart: string;
  dayIndex: number;
  shiftType: ShiftType;
} {
  const { dateOnly, hour } = getScheduleTimeParts(date);
  // A night shift that started at 23:00 the previous day is still that day's night
  // shift until 07:00, even though the calendar date has already rolled over.
  const shiftDateOnly = hour < 7 ? addDays(dateOnly, -1) : dateOnly;
  const shiftType: ShiftType = hour < 7 || hour >= 23 ? "NIGHT" : hour < 15 ? "MORNING" : "EVENING";
  const weekStart = getSundayWeekStart(new Date(`${shiftDateOnly}T12:00:00.000Z`));
  const dayIndex = diffDays(weekStart, shiftDateOnly);

  return { weekStart, dayIndex, shiftType };
}

export function getShiftWindow(weekStart: string, dayIndex: number, shiftType: ShiftType) {
  const base = new Date(`${weekStart.slice(0, 10)}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + dayIndex);

  const definition = SHIFT_DEFINITIONS[shiftType];
  const [startHour, startMinute] = definition.startsAt.split(":").map(Number);
  const [endHour, endMinute] = definition.endsAt.split(":").map(Number);

  const starts = new Date(base);
  starts.setUTCHours(startHour, startMinute, 0, 0);

  const ends = new Date(base);
  ends.setUTCHours(endHour, endMinute, 0, 0);
  if (ends <= starts) {
    ends.setUTCDate(ends.getUTCDate() + 1);
  }

  return { starts, ends };
}

export function calculateSummaries(
  employees: Employee[],
  assignments: ShiftAssignment[]
): EmployeeSummary[] {
  return employees.map((employee) => {
    const ownAssignments = assignments.filter((assignment) => assignment.employeeId === employee.id);
    return {
      employeeId: employee.id,
      shiftCount: ownAssignments.length,
      workHours: ownAssignments.reduce(
        (sum, assignment) => sum + SHIFT_DEFINITIONS[assignment.shiftType].hours,
        0
      ),
      minShifts: employee.weeklyMinShifts,
      maxShifts: employee.weeklyMaxShifts
    };
  });
}

export function validateAssignment(
  input: AssignmentInput,
  employee: Employee,
  existingAssignments: ShiftAssignment[],
  availabilityBlocks: AvailabilityBlock[]
): AssignmentValidation {
  const errors = [];
  const warnings = [];
  const ownAssignments = existingAssignments.filter(
    (assignment) => assignment.employeeId === input.employeeId
  );

  const weeklyLimit = Math.min(employee.weeklyMaxShifts, MAX_WEEKLY_SHIFTS);
  if (ownAssignments.length >= weeklyLimit) {
    errors.push({
      code: "WEEKLY_LIMIT",
      message: `העובד כבר שובץ ל-${weeklyLimit} משמרות השבוע.`
    });
  }

  if (
    ownAssignments.some(
      (assignment) =>
        assignment.dayIndex === input.dayIndex && assignment.shiftType === input.shiftType
    )
  ) {
    errors.push({
      code: "DUPLICATE_SHIFT",
      message: "העובד כבר משובץ למשמרת הזו."
    });
  }

  if (isBlocked(input, availabilityBlocks)) {
    warnings.push({
      code: "AVAILABILITY_BLOCKED",
      message: "העובד סימן שאינו זמין למשמרת הזו. אפשר לשבץ לאחר אישור החריגה."
    });
  }

  warnings.push(...getRestWarnings(input, ownAssignments));

  return { errors, warnings };
}

export function getRestWarnings(
  input: AssignmentInput,
  existingAssignments: ShiftAssignment[]
): AssignmentIssue[] {
  const ownAssignments = existingAssignments.filter(
    (assignment) => assignment.employeeId === input.employeeId
  );
  const candidate = getShiftWindow(input.weekStart, input.dayIndex, input.shiftType);
  const warnings: AssignmentIssue[] = [];

  for (const assignment of ownAssignments) {
    const existing = getShiftWindow(assignment.weekStart, assignment.dayIndex, assignment.shiftType);
    const gapAfterExisting = hoursBetween(existing.ends, candidate.starts);
    const gapBeforeExisting = hoursBetween(candidate.ends, existing.starts);

    addRestWarning(gapAfterExisting, warnings);
    addRestWarning(gapBeforeExisting, warnings);
  }

  return uniqueIssues(warnings);
}

function isBlocked(input: AssignmentInput, availabilityBlocks: AvailabilityBlock[]): boolean {
  const candidate = getShiftWindow(input.weekStart, input.dayIndex, input.shiftType);

  return availabilityBlocks
    .filter(
      (block) =>
        block.employeeId === input.employeeId &&
        block.dayIndex === input.dayIndex &&
        block.status !== "PREFERRED"
    )
    .some((block) => {
      if (block.status === "TIME_OFF") {
        return true;
      }

      if (block.shiftType) {
        return block.shiftType === input.shiftType;
      }

      if (!block.startsAt || !block.endsAt) {
        return false;
      }

      const blockedWindow = getTimeRange(input.weekStart, input.dayIndex, block.startsAt, block.endsAt);
      return candidate.starts < blockedWindow.ends && candidate.ends > blockedWindow.starts;
    });
}

function addRestWarning(gapHours: number, warnings: AssignmentIssue[]) {
  if (gapHours < 0 || gapHours > MIN_REST_HOURS) {
    return;
  }

  if (gapHours === MIN_REST_HOURS) {
    warnings.push({
      code: "EIGHT_EIGHT_REST",
      message: "אזהרת 8-8: לעובד יש 8 שעות מנוחה בלבד בין המשמרות."
    });
    return;
  }

  warnings.push({
    code: "INSUFFICIENT_REST",
    message: `אזהרה: לעובד יש רק ${gapHours} שעות מנוחה בין המשמרות.`
  });
}

function getTimeRange(weekStart: string, dayIndex: number, startsAt: string, endsAt: string) {
  const base = new Date(`${weekStart.slice(0, 10)}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + dayIndex);

  const [startHour, startMinute] = startsAt.split(":").map(Number);
  const [endHour, endMinute] = endsAt.split(":").map(Number);
  const starts = new Date(base);
  starts.setUTCHours(startHour, startMinute, 0, 0);
  const ends = new Date(base);
  ends.setUTCHours(endHour, endMinute, 0, 0);
  if (ends <= starts) {
    ends.setUTCDate(ends.getUTCDate() + 1);
  }

  return { starts, ends };
}

function hoursBetween(left: Date, right: Date): number {
  return (right.getTime() - left.getTime()) / 1000 / 60 / 60;
}

function uniqueIssues<T extends { code: string }>(issues: T[]): T[] {
  return Array.from(new Map(issues.map((issue) => [issue.code, issue])).values());
}
