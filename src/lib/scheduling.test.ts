import { describe, expect, it } from "vitest";
import { autoSchedule, coverageTotals, restBetween, validateAssignment, weekCoverage } from "./scheduling";
import { weekdaysMask } from "./shiftTime";
import type { Assignment, AvailabilityEntry, ShiftTemplate } from "./types";

const WEEK = "2026-10-04";

function template(overrides: Partial<ShiftTemplate>): ShiftTemplate {
  return {
    id: "morning",
    teamId: "team",
    name: "בוקר",
    startsAt: "08:00",
    endsAt: "16:00",
    requiredCount: 2,
    weekdays: weekdaysMask([0, 1, 2, 3, 4]),
    sortOrder: 0,
    isActive: true,
    ...overrides
  };
}

function assignment(overrides: Partial<Assignment>): Assignment {
  return {
    id: Math.random().toString(36),
    userId: "dana",
    shiftTemplateId: "morning",
    teamId: "team",
    workDate: WEEK,
    startsAt: "08:00",
    endsAt: "16:00",
    ...overrides
  };
}

const dana = { id: "dana", name: "דנה", isActive: true, weeklyMinHours: 0, weeklyMaxHours: 40 };

describe("validateAssignment", () => {
  const morning = template({});
  const late = template({ id: "late", name: "ערב", startsAt: "14:00", endsAt: "22:00" });

  it("blocks overlapping shifts and too little rest", () => {
    const existing = [assignment({ shiftTemplateId: "late", startsAt: "14:00", endsAt: "22:00" })];
    const overlap = validateAssignment({ userId: "dana", template: morning, workDate: WEEK }, dana, existing, [], WEEK);
    expect(overlap.errors.map((issue) => issue.code)).toContain("OVERLAP");

    // 22:00 -> 05:00 next morning is 7 hours of rest.
    const early = template({ id: "early", startsAt: "05:00", endsAt: "13:00" });
    const rest = validateAssignment({ userId: "dana", template: early, workDate: "2026-10-05" }, dana, existing, [], WEEK);
    expect(rest.errors.map((issue) => issue.code)).toEqual(["REST"]);
    expect(restBetween(existing[0], { workDate: "2026-10-05", startsAt: "06:00", endsAt: "14:00" })).toBe(8);
  });

  it("refuses days the shift doesn't run and warns about hours and availability", () => {
    const friday = validateAssignment({ userId: "dana", template: morning, workDate: "2026-10-09" }, dana, [], [], WEEK);
    expect(friday.errors.map((issue) => issue.code)).toEqual(["SHIFT_NOT_RUNNING"]);

    const busyWeek = [1, 2, 3, 4].map((day) => assignment({ workDate: `2026-10-0${4 + day}`, startsAt: "08:00", endsAt: "18:00" }));
    const unavailable: AvailabilityEntry[] = [
      { id: "a", userId: "dana", workDate: WEEK, shiftTemplateId: "late", status: "UNAVAILABLE", note: "" }
    ];
    const result = validateAssignment({ userId: "dana", template: late, workDate: WEEK }, dana, busyWeek, unavailable, WEEK);
    expect(result.errors).toEqual([]);
    expect(result.warnings.map((issue) => issue.code)).toEqual(["WEEKLY_HOURS", "UNAVAILABLE"]);
  });
});

describe("coverage", () => {
  it("counts staffed vs needed, without letting overstaffing hide gaps", () => {
    const morning = template({});
    const cells = weekCoverage(WEEK, [morning], [
      assignment({ userId: "a" }),
      assignment({ userId: "b" }),
      assignment({ userId: "c" }),
      assignment({ userId: "a", workDate: "2026-10-05" })
    ]);
    expect(cells.map((cell) => cell.status)).toEqual(["over", "under", "empty", "empty", "empty", "closed", "closed"]);
    expect(coverageTotals(cells)).toMatchObject({ required: 10, filled: 3, openSlots: 7, percent: 30 });
  });
});

describe("autoSchedule", () => {
  const members = ["a", "b", "c", "d"].map((id) => ({ id, name: id, isActive: true, weeklyMinHours: 0, weeklyMaxHours: 40 }));

  it("fills every shift to its headcount, spreading hours evenly", () => {
    const result = autoSchedule({ weekStart: WEEK, templates: [template({})], members, assignments: [], availability: [] });
    expect(result.unfilled).toEqual([]);
    expect(result.created).toHaveLength(10);
    const perPerson = members.map((member) => result.created.filter((item) => item.userId === member.id).length);
    expect(Math.max(...perPerson) - Math.min(...perPerson)).toBeLessThanOrEqual(1);
  });

  it("respects preferences, time off, daily limits and the weekly maximum", () => {
    const availability: AvailabilityEntry[] = [
      { id: "1", userId: "d", workDate: WEEK, shiftTemplateId: "morning", status: "PREFERRED", note: "" },
      { id: "2", userId: "a", workDate: WEEK, shiftTemplateId: null, status: "TIME_OFF", note: "" }
    ];
    const small = members.map((member) => ({ ...member, weeklyMaxHours: member.id === "b" ? 8 : 40 }));
    const result = autoSchedule({
      weekStart: WEEK,
      templates: [template({ requiredCount: 1 }), template({ id: "late", startsAt: "16:00", endsAt: "23:00", requiredCount: 1 })],
      members: small,
      assignments: [],
      availability
    });
    const sunday = result.created.filter((item) => item.workDate === WEEK);
    expect(sunday.find((item) => item.shiftTemplateId === "morning")?.userId).toBe("d");
    expect(sunday.some((item) => item.userId === "a")).toBe(false);
    // Nobody works two shifts on the same day, and b stops at 8 hours.
    for (const date of new Set(result.created.map((item) => item.workDate))) {
      const users = result.created.filter((item) => item.workDate === date).map((item) => item.userId);
      expect(new Set(users).size).toBe(users.length);
    }
    expect(result.created.filter((item) => item.userId === "b")).toHaveLength(1);
  });

  it("keeps existing assignments and reports what it couldn't fill", () => {
    const result = autoSchedule({
      weekStart: WEEK,
      templates: [template({ requiredCount: 3, weekdays: weekdaysMask([0]) })],
      members: members.slice(0, 2),
      assignments: [assignment({ userId: "a" })],
      availability: []
    });
    expect(result.created).toEqual([{ userId: "b", shiftTemplateId: "morning", workDate: WEEK }]);
    expect(result.unfilled).toEqual([{ shiftTemplateId: "morning", workDate: WEEK, missing: 1 }]);
  });
});
