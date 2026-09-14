import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  listEmployees: vi.fn(),
  listAssignments: vi.fn(),
  listAvailabilityBlocks: vi.fn(),
  replaceAssignment: vi.fn()
}));

vi.mock("@/server/api", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireApiUser: mocks.requireApiUser,
    isApiError: (value: unknown) => value instanceof NextResponse,
    jsonError: (message: string, status = 400, details?: unknown) =>
      NextResponse.json({ error: message, details }, { status })
  };
});
vi.mock("@/server/repositories", () => ({
  listEmployees: mocks.listEmployees,
  listAssignments: mocks.listAssignments,
  listAvailabilityBlocks: mocks.listAvailabilityBlocks,
  replaceAssignment: mocks.replaceAssignment
}));

import { POST } from "./route";

const manager = { id: "manager", email: "manager@example.com", name: "Manager", role: "MANAGER" };
const employee = {
  id: "employee-1",
  userId: "user-1",
  name: "Employee",
  email: "employee@example.com",
  roleTitle: "Employee",
  weeklyMinShifts: 1,
  weeklyMaxShifts: 6,
  isActive: true
};
const occupied = {
  id: "assignment-1",
  employeeId: "employee-old",
  weekStart: "2026-08-09",
  dayIndex: 1,
  shiftType: "MORNING",
  notes: ""
};

function assignmentRequest(replaceAssignmentId?: string) {
  return new Request("http://localhost/api/assignments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      employeeId: employee.id,
      weekStart: occupied.weekStart,
      dayIndex: occupied.dayIndex,
      shiftType: occupied.shiftType,
      replaceAssignmentId
    })
  });
}

describe("single assignment per shift", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue(manager);
    mocks.listEmployees.mockResolvedValue([employee]);
    mocks.listAssignments.mockResolvedValue([occupied]);
    mocks.listAvailabilityBlocks.mockResolvedValue([]);
    mocks.replaceAssignment.mockResolvedValue({ ...occupied, employeeId: employee.id });
  });

  it("requires explicit replacement confirmation for an occupied shift", async () => {
    const response = await POST(assignmentRequest());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      details: { errors: [{ code: "SHIFT_OCCUPIED" }] }
    });
    expect(mocks.replaceAssignment).not.toHaveBeenCalled();
  });

  it("replaces the exact occupied assignment after confirmation", async () => {
    const response = await POST(assignmentRequest(occupied.id));

    expect(response.status).toBe(201);
    expect(mocks.replaceAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: employee.id }),
      occupied.id
    );
  });
});
