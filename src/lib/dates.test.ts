import { describe, expect, it } from "vitest";
import { getAvailabilityWeekStart, getScheduleDays, getScheduleMonthRange } from "./dates";

describe("schedule dates", () => {
  it("builds a full Sunday-to-Saturday week with dates", () => {
    const days = getScheduleDays("2026-07-19");

    expect(days).toHaveLength(7);
    expect(days[0]).toMatchObject({ label: "ראשון", date: "2026-07-19" });
    expect(days[6]).toMatchObject({ label: "שבת", date: "2026-07-25" });
  });

  it("targets availability submissions two Sundays ahead", () => {
    expect(getAvailabilityWeekStart(new Date("2026-08-09T09:00:00.000Z"))).toBe("2026-08-23");
    expect(getAvailabilityWeekStart(new Date("2026-08-12T09:00:00.000Z"))).toBe("2026-08-23");
  });

  it("uses Israel time when Sunday starts before UTC midnight", () => {
    expect(getAvailabilityWeekStart(new Date("2026-08-08T22:30:00.000Z"))).toBe("2026-08-23");
  });

  it("computes the calendar month range in Israel time", () => {
    expect(getScheduleMonthRange(new Date("2026-08-15T09:00:00.000Z"))).toEqual({
      monthStart: "2026-08-01",
      monthEnd: "2026-09-01"
    });
  });

  it("rolls the month range over at the Israel-time month boundary near UTC midnight", () => {
    // 2026-08-31T22:30:00Z is already 2026-09-01 in Israel (UTC+3 in August).
    expect(getScheduleMonthRange(new Date("2026-08-31T22:30:00.000Z"))).toEqual({
      monthStart: "2026-09-01",
      monthEnd: "2026-10-01"
    });
  });
});
