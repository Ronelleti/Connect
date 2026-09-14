import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findUserById: vi.fn()
}));

vi.mock("./session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("./repositories", () => ({
  findUserById: mocks.findUserById,
  toUser: (row: { id: string; email: string; name: string; role: string }) => row
}));

import { requireApiUser } from "./api";

const employee = {
  id: "user-1",
  email: "employee@example.com",
  name: "Employee",
  role: "EMPLOYEE"
};

describe("API authorization", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unauthenticated requests", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const response = await requireApiUser();

    expect(response).toMatchObject({ status: 401 });
    expect(mocks.findUserById).not.toHaveBeenCalled();
  });

  it("re-checks the current database role and rejects an employee from manager actions", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...employee, role: "MANAGER" });
    mocks.findUserById.mockResolvedValue(employee);

    const response = await requireApiUser(["MANAGER"]);

    expect(response).toMatchObject({ status: 403 });
    expect(mocks.findUserById).toHaveBeenCalledWith(employee.id);
  });

  it("allows a current manager", async () => {
    const manager = { ...employee, role: "MANAGER" };
    mocks.getCurrentUser.mockResolvedValue(manager);
    mocks.findUserById.mockResolvedValue(manager);

    await expect(requireApiUser(["MANAGER"])).resolves.toEqual(manager);
  });
});
