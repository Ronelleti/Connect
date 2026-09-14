import { describe, expect, it } from "vitest";
import { buildScheduleCsv, scheduleExportFilename } from "./scheduleExport";
import type { Employee, EmployeeSummary, ShiftAssignment } from "./types";

const employee: Employee = {
  id: "employee-1",
  userId: "user-1",
  name: "נועה כהן",
  email: "noa@example.com",
  roleTitle: "עובדת משמרת",
  weeklyMinShifts: 1,
  weeklyMaxShifts: 6,
  isActive: true
};

describe("schedule CSV export", () => {
  it("includes Hebrew day, date, shift and weekly totals", () => {
    const assignments: ShiftAssignment[] = [{
      id: "assignment-1",
      employeeId: employee.id,
      weekStart: "2026-07-19",
      dayIndex: 6,
      shiftType: "NIGHT",
      notes: ""
    }];
    const summaries: EmployeeSummary[] = [{
      employeeId: employee.id,
      shiftCount: 1,
      workHours: 8,
      minShifts: 1,
      maxShifts: 6
    }];

    const csv = buildScheduleCsv({
      weekStart: "2026-07-19",
      employees: [employee],
      assignments,
      summaries
    });

    expect(csv).toContain('"נועה כהן","עובדת משמרת","שבת","25.07","לילה"');
    expect(csv).toContain('"23:00-07:00","1","8"');
    expect(scheduleExportFilename("2026-07-19")).toBe("wecomconnect-schedule-2026-07-19.csv");
  });
});
