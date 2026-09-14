import { describe, expect, it } from "vitest";
import { parseEmployeeInput } from "./employeeValidation";

const validEmployee = {
  name: "עובד בדיקה",
  email: "test@wecomconnect.local",
  roleTitle: "עובד משמרת",
  weeklyMinShifts: 1,
  weeklyMaxShifts: 6
};

describe("parseEmployeeInput", () => {
  it("normalizes valid manager input", () => {
    expect(parseEmployeeInput({ ...validEmployee, email: " TEST@WECOMCONNECT.LOCAL " })).toEqual({
      ...validEmployee,
      email: "test@wecomconnect.local"
    });
  });

  it.each([
    { weeklyMinShifts: 0 },
    { weeklyMaxShifts: 7 },
    { weeklyMinShifts: 5, weeklyMaxShifts: 2 }
  ])("rejects invalid weekly shift limits: %o", (limits) => {
    expect(parseEmployeeInput({ ...validEmployee, ...limits })).toBeNull();
  });
});
