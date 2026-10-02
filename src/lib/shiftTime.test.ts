import { describe, expect, it } from "vitest";
import { hourlyLoad, normalizeTime, runsOnWeekday, shiftHours, weekdaysMask, weekdayOf } from "./shiftTime";

describe("shift time", () => {
  it("measures shifts, including ones that end after midnight", () => {
    expect(shiftHours("08:00", "17:00")).toBe(9);
    expect(shiftHours("22:00", "06:00")).toBe(8);
    expect(shiftHours("09:30", "14:00")).toBe(4.5);
    expect(normalizeTime("07:05:00")).toBe("07:05");
  });

  it("reads weekday masks", () => {
    const sundayToThursday = weekdaysMask([0, 1, 2, 3, 4]);
    expect(weekdayOf("2026-10-04")).toBe(0);
    expect(runsOnWeekday(sundayToThursday, weekdayOf("2026-10-08"))).toBe(true);
    expect(runsOnWeekday(sundayToThursday, weekdayOf("2026-10-09"))).toBe(false);
  });

  it("counts people per hour, spilling overnight shifts into the next day", () => {
    const load = hourlyLoad("2026-10-04", [
      { workDate: "2026-10-04", startsAt: "08:00", endsAt: "10:30" },
      { workDate: "2026-10-04", startsAt: "09:00", endsAt: "10:00" },
      { workDate: "2026-10-10", startsAt: "23:00", endsAt: "07:00" },
      { workDate: "2026-10-03", startsAt: "22:00", endsAt: "02:00" }
    ]);
    expect(load[0].slice(7, 12)).toEqual([0, 1, 2, 1, 0]);
    expect(load[6][23]).toBe(1);
    // The Saturday-night shift before the week reaches into Sunday 00:00-02:00.
    expect(load[0].slice(0, 3)).toEqual([1, 1, 0]);
  });
});
