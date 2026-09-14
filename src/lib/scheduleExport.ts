import { formatHebrewDate, getScheduleDays } from "./dates";
import { SHIFT_DEFINITIONS, getShiftTypes } from "./shifts";
import type { Employee, EmployeeSummary, ShiftAssignment } from "./types";

interface ScheduleExportInput {
  weekStart: string;
  employees: Employee[];
  assignments: ShiftAssignment[];
  summaries: EmployeeSummary[];
}

export function buildScheduleCsv(input: ScheduleExportInput): string {
  const days = getScheduleDays(input.weekStart);
  const shiftOrder = new Map(getShiftTypes().map((shiftType, index) => [shiftType, index]));
  const summaryByEmployee = new Map(
    input.summaries.map((summary) => [summary.employeeId, summary])
  );
  const rows = [[
    "עובד",
    "תפקיד",
    "יום",
    "תאריך",
    "משמרת",
    "שעות משמרת",
    "משמרות בשבוע",
    "סהכ שעות בשבוע"
  ]];

  for (const employee of input.employees) {
    const ownAssignments = input.assignments
      .filter((assignment) => assignment.employeeId === employee.id)
      .sort(
        (left, right) =>
          left.dayIndex - right.dayIndex ||
          (shiftOrder.get(left.shiftType) ?? 0) - (shiftOrder.get(right.shiftType) ?? 0)
      );
    const summary = summaryByEmployee.get(employee.id);

    if (ownAssignments.length === 0) {
      rows.push([employee.name, employee.roleTitle, "", "", "", "", "0", "0"]);
      continue;
    }

    for (const assignment of ownAssignments) {
      const day = days[assignment.dayIndex];
      const shift = SHIFT_DEFINITIONS[assignment.shiftType];
      rows.push([
        employee.name,
        employee.roleTitle,
        day?.label ?? "",
        day ? formatHebrewDate(day.date) : "",
        shift.label,
        `${shift.startsAt}-${shift.endsAt}`,
        String(summary?.shiftCount ?? ownAssignments.length),
        String(summary?.workHours ?? ownAssignments.length * shift.hours)
      ]);
    }
  }

  // The BOM keeps Hebrew column names readable when the CSV is opened in Excel.
  return `\uFEFF${rows.map(toCsvRow).join("\r\n")}`;
}

export function scheduleExportFilename(weekStart: string): string {
  return `wecomconnect-schedule-${weekStart.slice(0, 10)}.csv`;
}

function toCsvRow(values: string[]): string {
  return values.map((value) => `"${value.replaceAll('"', '""')}"`).join(",");
}
