import { describe, expect, it } from "vitest";
import { getEmployeeColor } from "./employeeColors";

describe("employee colors", () => {
  it("returns a stable color for the same registered user", () => {
    expect(getEmployeeColor("user-123")).toEqual(getEmployeeColor("user-123"));
  });

  it("uses the same color for every employee", () => {
    expect(getEmployeeColor("user-1")).toEqual(getEmployeeColor("user-2"));
  });
});
