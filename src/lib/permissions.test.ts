import { describe, expect, it } from "vitest";
import {
  assignableRoles,
  can,
  canEditPermissions,
  canManagePerson,
  hasPermission,
  teamsWithPermission,
  visibleTeams,
  type Actor
} from "./permissions";

const support1 = { id: "t-support-1", departmentId: "d-support" };
const support2 = { id: "t-support-2", departmentId: "d-support" };
const sales1 = { id: "t-sales-1", departmentId: "d-sales" };
const teams = [support1, support2, sales1];

function actor(overrides: Partial<Actor>): Actor {
  return { id: "me", role: "EMPLOYEE", departmentId: "d-support", teamId: support1.id, extraPermissions: [], ...overrides };
}

describe("permissions", () => {
  it("gives admins everything everywhere", () => {
    const admin = actor({ role: "ADMIN", departmentId: null, teamId: null });
    expect(can(admin, "schedule.edit", sales1)).toBe(true);
    expect(visibleTeams(admin, teams)).toHaveLength(3);
    expect(canEditPermissions(admin)).toBe(true);
  });

  it("limits a department manager to their department", () => {
    const manager = actor({ role: "DEPARTMENT_MANAGER", teamId: null });
    expect(can(manager, "shifts.configure", support2)).toBe(true);
    expect(can(manager, "schedule.edit", sales1)).toBe(false);
    expect(teamsWithPermission(manager, "people.manage", teams).map((team) => team.id)).toEqual([support1.id, support2.id]);
    expect(canEditPermissions(manager)).toBe(false);
  });

  it("limits a team lead to their own team and their role's defaults", () => {
    const lead = actor({ role: "TEAM_LEAD" });
    expect(can(lead, "schedule.publish", support1)).toBe(true);
    expect(can(lead, "schedule.publish", support2)).toBe(false);
    expect(can(lead, "shifts.configure", support1)).toBe(false);
  });

  it("adds per-person extras on top of the role", () => {
    const employee = actor({ extraPermissions: ["requests.approve", "department.view"] });
    expect(hasPermission(employee, "schedule.edit")).toBe(false);
    expect(can(employee, "requests.approve", support1)).toBe(true);
    // An extra permission still only applies inside the person's own team...
    expect(can(employee, "requests.approve", support2)).toBe(false);
    // ...but department.view widens what they can see.
    expect(visibleTeams(employee, teams).map((team) => team.id)).toEqual([support1.id, support2.id]);
    expect(visibleTeams(actor({}), teams).map((team) => team.id)).toEqual([support1.id]);
  });

  it("never lets someone manage people at or above their own role", () => {
    const manager = actor({ role: "DEPARTMENT_MANAGER", teamId: null });
    expect(assignableRoles(manager)).toEqual(["TEAM_LEAD", "EXPERT", "EMPLOYEE"]);
    const lead = { id: "x", role: "TEAM_LEAD" as const, departmentId: "d-support", teamId: support2.id };
    expect(canManagePerson(manager, lead, teams)).toBe(true);
    expect(canManagePerson(manager, { ...lead, role: "DEPARTMENT_MANAGER" }, teams)).toBe(false);
    expect(canManagePerson(manager, { ...lead, teamId: sales1.id, departmentId: "d-sales" }, teams)).toBe(false);

    const leadWithPeople = actor({ role: "TEAM_LEAD", extraPermissions: ["people.manage"] });
    const employee = { id: "y", role: "EMPLOYEE" as const, departmentId: "d-support", teamId: support1.id };
    expect(canManagePerson(leadWithPeople, employee, teams)).toBe(true);
    expect(canManagePerson(leadWithPeople, { ...employee, teamId: support2.id }, teams)).toBe(false);
    expect(canManagePerson(actor({ role: "TEAM_LEAD" }), employee, teams)).toBe(false);
  });

  it("gives senior managers everything except admin-only settings", () => {
    const senior = actor({ role: "SENIOR_MANAGER", departmentId: null, teamId: null });
    expect(can(senior, "requests.approve", sales1)).toBe(true);
    expect(can(senior, "schedule.edit", support2)).toBe(true);
    expect(visibleTeams(senior, teams)).toHaveLength(3);
    expect(canEditPermissions(senior)).toBe(false);
    expect(assignableRoles(senior)).toEqual(["DEPARTMENT_MANAGER", "TEAM_LEAD", "EXPERT", "EMPLOYEE"]);
    expect(canManagePerson(senior, { id: "m", role: "DEPARTMENT_MANAGER", departmentId: "d-sales", teamId: null }, teams)).toBe(true);
    expect(canManagePerson(senior, { id: "s", role: "SENIOR_MANAGER", departmentId: null, teamId: null }, teams)).toBe(false);
  });

  it("lets experts see every team without managing any", () => {
    const expert = actor({ role: "EXPERT" });
    expect(visibleTeams(expert, teams)).toHaveLength(3);
    expect(can(expert, "schedule.edit", support1)).toBe(false);
    expect(assignableRoles(actor({ role: "TEAM_LEAD" }))).toEqual(["EXPERT", "EMPLOYEE"]);
  });
});
