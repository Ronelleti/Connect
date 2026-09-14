import { describe, expect, it } from "vitest";
import {
  availabilityStatusLabel,
  findShiftAvailability,
  findTimeOff,
  getAssignmentAvailabilityHint,
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
});
