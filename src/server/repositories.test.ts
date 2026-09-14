import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  query: vi.fn()
}));

vi.mock("./db", () => ({
  getPool: () => ({ connect: mocks.connect }),
  query: mocks.query
}));

import { decideSwapRequest } from "./repositories";

const pendingSwap = {
  id: "swap-1",
  requester_assignment_id: "11111111-1111-1111-1111-111111111111",
  requester_employee_id_snapshot: "employee-1",
  target_employee_id: "employee-2",
  target_assignment_id: null,
  status: "PENDING_EMPLOYEE",
  employee_decided_at: null,
  manager_decided_at: null,
  created_at: "2026-08-11T00:00:00.000Z"
};

describe("swap decisions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connect.mockResolvedValue({ query: mocks.query, release: vi.fn() });
  });

  it("records an early manager approval without applying the assignment yet", async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT * FROM shift_swap_requests")) {
        return { rows: [pendingSwap] };
      }
      if (sql.includes("UPDATE shift_swap_requests")) {
        return {
          rows: [{
            ...pendingSwap,
            manager_decided_at: "2026-08-11T08:00:00.000Z"
          }]
        };
      }
      return { rows: [] };
    });

    const result = await decideSwapRequest(pendingSwap.id, "approve_manager");

    expect(result?.status).toBe("PENDING_EMPLOYEE");
    expect(mocks.query).not.toHaveBeenCalledWith(
      expect.stringContaining("UPDATE shift_assignments"),
      expect.anything()
    );
  });

  it("applies the assignment when the employee approves after the manager", async () => {
    const managerApprovedSwap = {
      ...pendingSwap,
      manager_decided_at: "2026-08-11T08:00:00.000Z"
    };
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT * FROM shift_swap_requests")) {
        return { rows: [managerApprovedSwap] };
      }
      if (sql.includes("SELECT * FROM shift_assignments")) {
        return {
          rows: [{
            id: pendingSwap.requester_assignment_id,
            employee_id: "employee-1",
            week_start: "2026-08-16",
            day_index: 1,
            shift_type: "MORNING",
            notes: ""
          }]
        };
      }
      if (sql.includes("UPDATE shift_swap_requests")) {
        return {
          rows: [{
            ...managerApprovedSwap,
            status: "APPROVED",
            employee_decided_at: "2026-08-11T08:05:00.000Z"
          }]
        };
      }
      return { rows: [] };
    });

    const result = await decideSwapRequest(pendingSwap.id, "approve_employee");

    expect(result?.status).toBe("APPROVED");
    expect(mocks.query).toHaveBeenCalledWith(
      "UPDATE shift_assignments SET employee_id = $2 WHERE id = $1",
      [pendingSwap.requester_assignment_id, pendingSwap.target_employee_id]
    );
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'SUPERSEDED'"),
      [pendingSwap.id, pendingSwap.requester_assignment_id]
    );
  });

  it("completes approval when the requested assignment is already applied", async () => {
    const managerApprovedSwap = {
      ...pendingSwap,
      manager_decided_at: "2026-08-11T08:00:00.000Z"
    };
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT * FROM shift_swap_requests")) {
        return { rows: [managerApprovedSwap] };
      }
      if (sql.includes("SELECT * FROM shift_assignments")) {
        return {
          rows: [{
            id: pendingSwap.requester_assignment_id,
            employee_id: pendingSwap.target_employee_id,
            week_start: "2026-08-16",
            day_index: 2,
            shift_type: "MORNING",
            notes: ""
          }]
        };
      }
      if (sql.includes("UPDATE shift_swap_requests") && sql.includes("RETURNING")) {
        return {
          rows: [{
            ...managerApprovedSwap,
            status: "APPROVED",
            employee_decided_at: "2026-08-11T08:05:00.000Z"
          }]
        };
      }
      return { rows: [] };
    });

    const result = await decideSwapRequest(pendingSwap.id, "approve_employee");

    expect(result?.status).toBe("APPROVED");
    expect(mocks.query).not.toHaveBeenCalledWith(
      expect.stringContaining("UPDATE shift_assignments"),
      expect.anything()
    );
  });
});
