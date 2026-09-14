import { describe, expect, it } from "vitest";
import { generateWeeklySchedule } from "./autoSchedule";
import type { AvailabilityBlock, Employee, ShiftAssignment, ShiftType } from "./types";

const WEEK_START = "2026-07-19";

function makeEmployee(overrides: Partial<Employee> & { id: string; name: string }): Employee {
  return {
    userId: null,
    email: `${overrides.id}@example.com`,
    roleTitle: "עובד",
    weeklyMinShifts: 1,
    weeklyMaxShifts: 6,
    isActive: true,
    ...overrides
  };
}

function preference(
  employeeId: string,
  dayIndex: number,
  shiftType: ShiftType,
  status: AvailabilityBlock["status"]
): AvailabilityBlock {
  return {
    id: `${employeeId}-${dayIndex}-${shiftType}`,
    employeeId,
    weekStart: WEEK_START,
    dayIndex,
    shiftType,
    startsAt: null,
    endsAt: null,
    reason: "",
    status
  };
}

function findAssignment(
  created: ShiftAssignment[] | { dayIndex: number; shiftType: ShiftType; employeeId: string }[],
  dayIndex: number,
  shiftType: ShiftType
) {
  return created.find((item) => item.dayIndex === dayIndex && item.shiftType === shiftType);
}

describe("generateWeeklySchedule", () => {
  it("fills every empty shift when enough employees are available", () => {
    // 21 shifts this week / a weekly cap of 6 each needs at least 4 employees.
    const employees = [
      makeEmployee({ id: "a", name: "אביגיל" }),
      makeEmployee({ id: "b", name: "בן" }),
      makeEmployee({ id: "c", name: "גיל" }),
      makeEmployee({ id: "d", name: "דנה" })
    ];

    const result = generateWeeklySchedule(WEEK_START, employees, [], []);

    expect(result.created).toHaveLength(21);
    expect(result.unfilled).toHaveLength(0);
  });

  it("never assigns two shifts in a row to the same employee", () => {
    const employees = [
      makeEmployee({ id: "a", name: "אביגיל" }),
      makeEmployee({ id: "b", name: "בן" }),
      makeEmployee({ id: "c", name: "גיל" }),
      makeEmployee({ id: "d", name: "דנה" })
    ];

    const result = generateWeeklySchedule(WEEK_START, employees, [], []);
    const shiftTypes: ShiftType[] = ["MORNING", "EVENING", "NIGHT"];
    const slotOf = (dayIndex: number, shiftType: ShiftType) => dayIndex * 3 + shiftTypes.indexOf(shiftType);

    const slotsByEmployee = new Map<string, number[]>();
    for (const assignment of result.created) {
      const list = slotsByEmployee.get(assignment.employeeId) ?? [];
      list.push(slotOf(assignment.dayIndex, assignment.shiftType));
      slotsByEmployee.set(assignment.employeeId, list);
    }

    for (const slots of slotsByEmployee.values()) {
      slots.sort((x, y) => x - y);
      for (let i = 1; i < slots.length; i += 1) {
        expect(slots[i] - slots[i - 1]).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("never assigns a shift an employee marked unavailable", () => {
    const employees = [
      makeEmployee({ id: "a", name: "אביגיל" }),
      makeEmployee({ id: "b", name: "בן" }),
      makeEmployee({ id: "c", name: "גיל" })
    ];
    const blocks = [preference("a", 0, "MORNING", "UNAVAILABLE")];

    const result = generateWeeklySchedule(WEEK_START, employees, [], blocks);

    const sundayMorning = findAssignment(result.created, 0, "MORNING");
    expect(sundayMorning?.employeeId).not.toBe("a");
  });

  it("prefers an employee who marked the shift as preferred", () => {
    const employees = [
      makeEmployee({ id: "a", name: "אביגיל" }),
      makeEmployee({ id: "b", name: "בן" })
    ];
    const blocks = [preference("b", 0, "MORNING", "PREFERRED")];

    const result = generateWeeklySchedule(WEEK_START, employees, [], blocks);

    const sundayMorning = findAssignment(result.created, 0, "MORNING");
    expect(sundayMorning?.employeeId).toBe("b");
  });

  it("respects an employee's weekly max shifts", () => {
    const employees = [
      makeEmployee({ id: "a", name: "אביגיל", weeklyMaxShifts: 1 }),
      makeEmployee({ id: "b", name: "בן" })
    ];

    const result = generateWeeklySchedule(WEEK_START, employees, [], []);
    const aCount = result.created.filter((item) => item.employeeId === "a").length;
    expect(aCount).toBeLessThanOrEqual(1);
  });

  it("skips shifts that are already assigned", () => {
    const employees = [makeEmployee({ id: "a", name: "אביגיל" })];
    const existing: ShiftAssignment[] = [
      { id: "existing-1", employeeId: "a", weekStart: WEEK_START, dayIndex: 0, shiftType: "MORNING", notes: "" }
    ];

    const result = generateWeeklySchedule(WEEK_START, employees, existing, []);

    expect(findAssignment(result.created, 0, "MORNING")).toBeUndefined();
  });

  it("relaxes the rest rule only as a last resort when no one else can cover a shift", () => {
    const employees = [makeEmployee({ id: "a", name: "אביגיל" })];
    const existing: ShiftAssignment[] = [
      { id: "existing-1", employeeId: "a", weekStart: WEEK_START, dayIndex: 0, shiftType: "MORNING", notes: "" }
    ];

    const result = generateWeeklySchedule(WEEK_START, employees, existing, []);

    const eveningShift = findAssignment(result.created, 0, "EVENING");
    expect(eveningShift?.employeeId).toBe("a");
    expect(result.relaxedRest).toContainEqual(
      expect.objectContaining({ employeeId: "a", dayIndex: 0, shiftType: "EVENING" })
    );
  });

  it("leaves a shift unfilled when every employee is unavailable or maxed out", () => {
    const employees = [makeEmployee({ id: "a", name: "אביגיל", weeklyMaxShifts: 0 })];

    const result = generateWeeklySchedule(WEEK_START, employees, [], []);

    expect(result.unfilled.length).toBeGreaterThan(0);
    expect(result.created).toHaveLength(0);
  });
});
