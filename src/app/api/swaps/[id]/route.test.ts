import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  findSwapRequest: vi.fn(),
  listEmployees: vi.fn(),
  decideSwapRequest: vi.fn()
}));

vi.mock("@/server/api", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireApiUser: mocks.requireApiUser,
    isApiError: (value: unknown) => value instanceof NextResponse,
    jsonError: (message: string, status = 400) =>
      NextResponse.json({ error: message }, { status })
  };
});
vi.mock("@/server/repositories", () => ({
  findSwapRequest: mocks.findSwapRequest,
  listEmployees: mocks.listEmployees,
  decideSwapRequest: mocks.decideSwapRequest
}));

vi.mock("@/server/swapNotifications", () => ({
  notifySwapDecision: vi.fn()
}));

import { PATCH } from "./route";

const manager = { id: "manager-user", email: "admin@example.com", name: "admin", role: "MANAGER" };
const targetUser = { id: "target-user", email: "target@example.com", name: "Target", role: "EMPLOYEE" };
const pendingEmployeeSwap = {
  id: "swap-1",
  requesterAssignmentId: "assignment-1",
  targetEmployeeId: "employee-2",
  targetAssignmentId: null,
  status: "PENDING_EMPLOYEE",
  employeeDecidedAt: null,
  managerDecidedAt: null,
  createdAt: "2026-08-11T00:00:00.000Z"
};

function actionRequest(action: string) {
  return new Request("http://localhost/api/swaps/swap-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action })
  });
}

describe("swap approval stages", () => {
  beforeEach(() => vi.clearAllMocks());

  it("moves an approval by the target employee to manager review", async () => {
    mocks.requireApiUser.mockResolvedValue(targetUser);
    mocks.findSwapRequest.mockResolvedValue(pendingEmployeeSwap);
    mocks.listEmployees.mockResolvedValue([{
      id: pendingEmployeeSwap.targetEmployeeId,
      userId: targetUser.id
    }]);
    mocks.decideSwapRequest.mockResolvedValue({
      ...pendingEmployeeSwap,
      status: "PENDING_MANAGER",
      employeeDecidedAt: "2026-08-11T08:00:00.000Z"
    });

    const response = await PATCH(actionRequest("approve_employee"), {
      params: Promise.resolve({ id: pendingEmployeeSwap.id })
    });

    expect(response.status).toBe(200);
    expect(mocks.decideSwapRequest).toHaveBeenCalledWith(
      pendingEmployeeSwap.id,
      "approve_employee"
    );
  });

  it("allows admin to approve before the target employee", async () => {
    mocks.requireApiUser.mockResolvedValue(manager);
    mocks.findSwapRequest.mockResolvedValue(pendingEmployeeSwap);
    mocks.decideSwapRequest.mockResolvedValue({
      ...pendingEmployeeSwap,
      managerDecidedAt: "2026-08-11T08:00:00.000Z"
    });

    const response = await PATCH(actionRequest("approve_manager"), {
      params: Promise.resolve({ id: pendingEmployeeSwap.id })
    });

    expect(response.status).toBe(200);
    expect(mocks.requireApiUser).toHaveBeenCalledWith(["MANAGER"]);
    expect(mocks.decideSwapRequest).toHaveBeenCalledWith(
      pendingEmployeeSwap.id,
      "approve_manager"
    );
  });

  it("allows admin to decline before the target employee", async () => {
    mocks.requireApiUser.mockResolvedValue(manager);
    mocks.findSwapRequest.mockResolvedValue(pendingEmployeeSwap);
    mocks.decideSwapRequest.mockResolvedValue({
      ...pendingEmployeeSwap,
      status: "DECLINED_BY_MANAGER",
      managerDecidedAt: "2026-08-11T08:00:00.000Z"
    });

    const response = await PATCH(actionRequest("decline_manager"), {
      params: Promise.resolve({ id: pendingEmployeeSwap.id })
    });

    expect(response.status).toBe(200);
    expect(mocks.decideSwapRequest).toHaveBeenCalledWith(
      pendingEmployeeSwap.id,
      "decline_manager"
    );
  });

  it("rejects an employee who is not the requested target", async () => {
    mocks.requireApiUser.mockResolvedValue(targetUser);
    mocks.findSwapRequest.mockResolvedValue(pendingEmployeeSwap);
    mocks.listEmployees.mockResolvedValue([{
      id: pendingEmployeeSwap.targetEmployeeId,
      userId: "another-user"
    }]);

    const response = await PATCH(actionRequest("approve_employee"), {
      params: Promise.resolve({ id: pendingEmployeeSwap.id })
    });

    expect(response.status).toBe(403);
    expect(mocks.decideSwapRequest).not.toHaveBeenCalled();
  });
});
