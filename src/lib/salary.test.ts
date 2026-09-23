import { describe, expect, it } from "vitest";
import { estimateSalary, getPayPeriod } from "./salary";

describe("getPayPeriod", () => {
  it("runs from the 20th to the 19th of the next month and pays on the following 10th", () => {
    expect(getPayPeriod("2026-09-23")).toEqual({
      start: "2026-09-20",
      end: "2026-10-20",
      payday: "2026-11-10"
    });
  });

  it("puts days before the 20th in the period that started last month", () => {
    expect(getPayPeriod("2026-09-19")).toEqual({
      start: "2026-08-20",
      end: "2026-09-20",
      payday: "2026-10-10"
    });
  });

  it("handles the year boundary and period offsets", () => {
    expect(getPayPeriod("2026-01-05")).toEqual({
      start: "2025-12-20",
      end: "2026-01-20",
      payday: "2026-02-10"
    });
    expect(getPayPeriod("2026-01-05", -1).start).toBe("2025-11-20");
    expect(getPayPeriod("2026-01-05", 1).start).toBe("2026-01-20");
  });
});

describe("estimateSalary", () => {
  it("pays night hours at 125%", () => {
    const estimate = estimateSalary(["MORNING", "EVENING", "NIGHT"], 40);

    expect(estimate.regularHours).toBe(16);
    expect(estimate.nightHours).toBe(8);
    expect(estimate.gross).toBe(16 * 40 + 8 * 40 * 1.25);
  });

  it("estimates deductions for a low monthly wage", () => {
    const estimate = estimateSalary(Array(10).fill("MORNING"), 40);

    expect(estimate.gross).toBe(3200);
    // 10% bracket tax (320) is fully covered by 2.25 credit points (544.5).
    expect(estimate.incomeTax).toBe(0);
    expect(estimate.socialSecurity).toBe(136.64);
    expect(estimate.pension).toBe(192);
    expect(estimate.net).toBe(2871.36);
  });

  it("applies higher brackets and the full social security rate above the reduced ceiling", () => {
    const estimate = estimateSalary(Array(25).fill("MORNING"), 60);

    expect(estimate.gross).toBe(12000);
    // 7010*10% + 3050*14% + 1940*20% - 544.5
    expect(estimate.incomeTax).toBe(971.5);
    // 7522*4.27% + 4478*12%
    expect(estimate.socialSecurity).toBe(858.55);
    expect(estimate.net).toBe(12000 - 971.5 - 858.55 - 720);
  });
});
