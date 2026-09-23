import { describe, expect, it } from "vitest";
import {
  availabilityStatusLabel,
  findShiftAvailability,
  findTimeOff,
  getAssignmentAvailabilityHint,
  getHandoverAvailabilityIssues,
  isUnavailableForShift
} from "./availability";
import type { AvailabilityBlock } from "./types";

const blocks: AvailabilityBlock[] = [
  {
    id: "preferred",
    employeeId: "employee-1",
    weekStart: "2026-07-19",
    dayIndex: 0,
    shiftType: "MORNING",
    startsAt: null,
    endsAt: null,
    reason: "מעוניין לעבוד",
    status: "PREFERRED"
  },
  {
    id: "time-off",
    employeeId: "employee-1",
    weekStart: "2026-07-19",
    dayIndex: 1,
    shiftType: null,
    startsAt: null,
    endsAt: null,
    reason: "חופש",
    status: "TIME_OFF"
  }
];

describe("availability selectors", () => {
  it("finds shift and full-day constraints", () => {
    expect(findShiftAvailability(blocks, "employee-1", 0, "MORNING")?.id).toBe("preferred");
    expect(findTimeOff(blocks, "employee-1", 1)?.id).toBe("time-off");
  });

  it("uses full-day leave and preferences for assignment hints", () => {
    expect(getAssignmentAvailabilityHint(blocks, "employee-1", 0, "MORNING")).toBe("מעוניין");
    expect(isUnavailableForShift(blocks, "employee-1", 1, "NIGHT")).toBe(true);
    expect(getAssignmentAvailabilityHint(blocks, "employee-1", 1, "NIGHT")).toBe("לא זמין");
  });

  it("labels full-day leave in Hebrew", () => {
    expect(availabilityStatusLabel("TIME_OFF")).toBe("חופש");
  });

  it("never hands a shift to someone on vacation, and warns for an unavailable shift", () => {
    const unavailable: AvailabilityBlock = {
      ...blocks[0],
      id: "unavailable",
      dayIndex: 2,
      shiftType: "NIGHT",
      status: "UNAVAILABLE"
    };
    const all = [...blocks, unavailable];

    const vacation = getHandoverAvailabilityIssues(all, "employee-1", 1, "EVENING");
    expect(vacation.errors).toContainEqual(expect.objectContaining({ code: "ON_VACATION" }));

    const blocked = getHandoverAvailabilityIssues(all, "employee-1", 2, "NIGHT");
    expect(blocked.errors).toHaveLength(0);
    expect(blocked.warnings).toContainEqual(expect.objectContaining({ code: "AVAILABILITY_BLOCKED" }));

    expect(getHandoverAvailabilityIssues(all, "employee-1", 0, "MORNING")).toEqual({ errors: [], warnings: [] });
    expect(getHandoverAvailabilityIssues(all, "someone-else", 1, "EVENING")).toEqual({ errors: [], warnings: [] });
  });
});
