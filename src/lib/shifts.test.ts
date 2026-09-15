import { describe, expect, it } from "vitest";
import {
  SHIFT_DEFINITIONS,
  calculateSummaries,
  getCurrentShiftSlot,
  getRestWarnings,
  getShiftStartInstant,
  validateAssignment
} from "./shifts";
import type { AvailabilityBlock, Employee, ShiftAssignment } from "./types";

const employee: Employee = {
  id: "employee-1",
  userId: null,
  name: "נועה כהן",
  email: "noa@example.com",
  roleTitle: "עובדת",
  weeklyMinShifts: 1,
  weeklyMaxShifts: 6,
  isActive: true
};

function assignment(id: string, dayIndex: number, shiftType: ShiftAssignment["shiftType"]) {
  return {
    id,
    employeeId: employee.id,
    weekStart: "2026-07-19",
    dayIndex,
    shiftType,
    notes: ""
  };
}

describe("shift rules", () => {
  it("uses green, yellow, and red assignment colors by shift", () => {
    expect(SHIFT_DEFINITIONS.MORNING.color.solid).toBe("#4d8149");
    expect(SHIFT_DEFINITIONS.EVENING.color.solid).toBe("#a57806");
    expect(SHIFT_DEFINITIONS.NIGHT.color.solid).toBe("#b91820");
  });

  it("blocks assignments above the weekly maximum", () => {
    const existing = [
      assignment("1", 0, "MORNING"),
      assignment("2", 0, "NIGHT"),
      assignment("3", 1, "EVENING"),
      assignment("4", 2, "MORNING"),
      assignment("5", 3, "EVENING"),
      assignment("6", 4, "MORNING")
    ];

    const validation = validateAssignment(
      { employeeId: employee.id, weekStart: "2026-07-19", dayIndex: 4, shiftType: "NIGHT" },
      employee,
      existing,
      []
    );

    expect(validation.errors).toContainEqual(
      expect.objectContaining({ code: "WEEKLY_LIMIT" })
    );
  });

  it("warns but allows direct back-to-back shifts", () => {
    const validation = validateAssignment(
      { employeeId: employee.id, weekStart: "2026-07-19", dayIndex: 0, shiftType: "EVENING" },
      employee,
      [assignment("1", 0, "MORNING")],
      []
    );

    expect(validation.errors).toHaveLength(0);
    expect(validation.warnings).toContainEqual(
      expect.objectContaining({ code: "INSUFFICIENT_REST" })
    );
  });

  it("warns when a night shift is followed by next-day evening shift", () => {
    const nightShift = assignment("1", 0, "NIGHT");
    nightShift.weekStart = "2026-07-19T00:00:00.000Z";
    const validation = validateAssignment(
      { employeeId: employee.id, weekStart: "2026-07-19", dayIndex: 1, shiftType: "EVENING" },
      employee,
      [nightShift],
      []
    );

    expect(validation.errors).toHaveLength(0);
    expect(validation.warnings).toContainEqual(
      expect.objectContaining({ code: "EIGHT_EIGHT_REST" })
    );
  });

  it("detects back-to-back rest warnings for a proposed shift swap", () => {
    const warnings = getRestWarnings(
      { employeeId: employee.id, weekStart: "2026-07-19", dayIndex: 0, shiftType: "EVENING" },
      [assignment("1", 0, "MORNING")]
    );

    expect(warnings).toContainEqual(
      expect.objectContaining({ code: "INSUFFICIENT_REST" })
    );
  });

  it("detects an 8-8 rest warning for a proposed shift swap", () => {
    const warnings = getRestWarnings(
      { employeeId: employee.id, weekStart: "2026-07-19", dayIndex: 1, shiftType: "EVENING" },
      [assignment("1", 0, "NIGHT")]
    );

    expect(warnings).toContainEqual(
      expect.objectContaining({ code: "EIGHT_EIGHT_REST" })
    );
  });

  it("warns when a shift overlaps an employee availability block", () => {
    const blocks: AvailabilityBlock[] = [
      {
        id: "block-1",
        employeeId: employee.id,
        weekStart: "2026-07-19",
        dayIndex: 2,
        shiftType: "MORNING",
        startsAt: null,
        endsAt: null,
        reason: "סידור אישי",
        status: "UNAVAILABLE"
      }
    ];

    const validation = validateAssignment(
      { employeeId: employee.id, weekStart: "2026-07-19", dayIndex: 2, shiftType: "MORNING" },
      employee,
      [],
      blocks
    );

    expect(validation.errors).toHaveLength(0);
    expect(validation.warnings).toContainEqual(
      expect.objectContaining({ code: "AVAILABILITY_BLOCKED" })
    );
  });

  it("does not warn when the employee prefers the shift", () => {
    const preferred: AvailabilityBlock[] = [
      {
        id: "preference-1",
        employeeId: employee.id,
        weekStart: "2026-07-19",
        dayIndex: 5,
        shiftType: "EVENING",
        startsAt: null,
        endsAt: null,
        reason: "מעוניין לעבוד",
        status: "PREFERRED"
      }
    ];

    const validation = validateAssignment(
      { employeeId: employee.id, weekStart: "2026-07-19", dayIndex: 5, shiftType: "EVENING" },
      employee,
      [],
      preferred
    );

    expect(validation).toEqual({ errors: [], warnings: [] });
  });

  it("warns for any shift on a Time Off day", () => {
    const timeOff: AvailabilityBlock[] = [
      {
        id: "time-off-1",
        employeeId: employee.id,
        weekStart: "2026-07-19",
        dayIndex: 6,
        shiftType: null,
        startsAt: null,
        endsAt: null,
        reason: "Time Off",
        status: "TIME_OFF"
      }
    ];

    const validation = validateAssignment(
      { employeeId: employee.id, weekStart: "2026-07-19", dayIndex: 6, shiftType: "NIGHT" },
      employee,
      [],
      timeOff
    );

    expect(validation.warnings).toContainEqual(
      expect.objectContaining({ code: "AVAILABILITY_BLOCKED" })
    );
  });

  it("identifies the current shift slot from the time of day", () => {
    // 2026-07-19 is a Sunday; Israel is UTC+3 in July.
    expect(getCurrentShiftSlot(new Date("2026-07-19T10:00:00.000Z"))).toEqual({
      weekStart: "2026-07-19",
      dayIndex: 0,
      shiftType: "MORNING"
    });
    expect(getCurrentShiftSlot(new Date("2026-07-19T13:00:00.000Z"))).toEqual({
      weekStart: "2026-07-19",
      dayIndex: 0,
      shiftType: "EVENING"
    });
    expect(getCurrentShiftSlot(new Date("2026-07-19T20:00:00.000Z"))).toEqual({
      weekStart: "2026-07-19",
      dayIndex: 0,
      shiftType: "NIGHT"
    });
  });

  it("keeps a night shift on its starting day after midnight rolls the calendar date over", () => {
    // Local time is 2026-07-20T02:00, but the night shift started on Sunday 2026-07-19.
    expect(getCurrentShiftSlot(new Date("2026-07-19T23:00:00.000Z"))).toEqual({
      weekStart: "2026-07-19",
      dayIndex: 0,
      shiftType: "NIGHT"
    });
  });

  it("carries a night shift across into the previous week when it starts on a Saturday", () => {
    // Local time is 2026-07-19T03:00 (Sunday), but the night shift started on
    // Saturday 2026-07-18, which belongs to the previous week.
    expect(getCurrentShiftSlot(new Date("2026-07-19T00:00:00.000Z"))).toEqual({
      weekStart: "2026-07-12",
      dayIndex: 6,
      shiftType: "NIGHT"
    });
  });

  it("computes a shift's true real-world start instant, not a literal-UTC one", () => {
    // 2026-07-19 is in Israel's DST (UTC+3): 07:00 local is 04:00 UTC, not 07:00 UTC.
    expect(getShiftStartInstant("2026-07-19", 0, "MORNING").toISOString()).toBe(
      "2026-07-19T04:00:00.000Z"
    );
    // 2026-01-04 is Israel standard time (UTC+2): 07:00 local is 05:00 UTC.
    expect(getShiftStartInstant("2026-01-04", 0, "MORNING").toISOString()).toBe(
      "2026-01-04T05:00:00.000Z"
    );
  });

  it("rolls a shift start instant onto the correct absolute day", () => {
    // Day index 2 on a Sunday week-start lands on Tuesday.
    expect(getShiftStartInstant("2026-07-19", 2, "EVENING").toISOString()).toBe(
      "2026-07-21T12:00:00.000Z"
    );
  });

  it("summarizes shifts and work hours per employee", () => {
    const [summary] = calculateSummaries([employee], [
      assignment("1", 0, "MORNING"),
      assignment("2", 1, "NIGHT")
    ]);

    expect(summary).toMatchObject({
      employeeId: employee.id,
      shiftCount: 2,
      workHours: 16,
      maxShifts: 6
    });
  });
});
