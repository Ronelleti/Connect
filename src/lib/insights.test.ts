import { describe, expect, it } from "vitest";
import { buildInsights } from "./insights";
import { weekdaysMask } from "./shiftTime";
import type { Assignment, ShiftTemplate, Team } from "./types";

const WEEK = "2026-10-04";
const teams: Team[] = [
  { id: "t1", departmentId: "d", name: "Tier 1", colorSlot: 1 },
  { id: "t2", departmentId: "d", name: "Sales", colorSlot: 2 }
];
const templates: ShiftTemplate[] = [
  { id: "m", teamId: "t1", name: "בוקר", startsAt: "08:00", endsAt: "16:00", requiredCount: 2, weekdays: weekdaysMask([0]), sortOrder: 0, isActive: true },
  { id: "s", teamId: "t2", name: "יום", startsAt: "09:00", endsAt: "18:00", requiredCount: 1, weekdays: weekdaysMask([0]), sortOrder: 0, isActive: true }
];
function shift(userId: string, templateId: string, teamId: string, workDate = WEEK): Assignment {
  const template = templates.find((item) => item.id === templateId)!;
  return { id: `${userId}-${workDate}`, userId, shiftTemplateId: templateId, teamId, workDate, startsAt: template.startsAt, endsAt: template.endsAt };
}

describe("buildInsights", () => {
  const insights = buildInsights({
    weekStart: WEEK,
    teams,
    templates,
    assignments: [shift("a", "m", "t1"), shift("b", "s", "t2"), shift("a", "m", "t1", "2026-09-27")],
    members: [
      { id: "a", name: "אבי", teamId: "t1", weeklyMinHours: 10, weeklyMaxHours: 40 },
      { id: "b", name: "בת", teamId: "t2", weeklyMinHours: 0, weeklyMaxHours: 40 },
      { id: "c", name: "גיל", teamId: "t1", weeklyMinHours: 0, weeklyMaxHours: 40 }
    ],
    timeOffUserIds: new Set(["c"])
  });

  it("summarizes the week's coverage and hours", () => {
    expect(insights.kpis).toMatchObject({ coveragePercent: 67, required: 3, filled: 2, openSlots: 1, scheduledPeople: 2, totalHours: 17, timeOffPeople: 1 });
    expect(insights.teams.map((team) => [team.name, team.percent])).toEqual([["Tier 1", 50], ["Sales", 100]]);
    expect(insights.daily[0]).toEqual({ date: WEEK, required: 3, filled: 2, open: 1 });
  });

  it("ranks people by hours and flags those outside their limits", () => {
    expect(insights.people.map((person) => [person.name, person.hours])).toEqual([["בת", 9], ["אבי", 8], ["גיל", 0]]);
    expect(insights.peopleOutsideLimits).toBe(1);
  });

  it("counts hourly load and coverage trend", () => {
    expect(insights.hourly[0][8]).toBe(1);
    expect(insights.hourly[0][9]).toBe(2);
    expect(insights.trend.at(-1)).toEqual({ weekStart: WEEK, percent: 67 });
    expect(insights.trend.at(-2)).toEqual({ weekStart: "2026-09-27", percent: 33 });
  });
});
