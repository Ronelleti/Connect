// Who can do what. Everyone has a role with default permissions; an admin can switch on
// extra permissions for one person. A permission only applies to the teams in the
// person's scope: everything for an admin or a senior manager, their department for a
// department manager, and their own team for everyone else. Experts belong to a home
// team but can be scheduled into, and see, every team.

export const ROLES = ["ADMIN", "SENIOR_MANAGER", "DEPARTMENT_MANAGER", "TEAM_LEAD", "EXPERT", "EMPLOYEE"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "schedule.edit",
  "schedule.publish",
  "requests.approve",
  "reports.view",
  "shifts.configure",
  "people.manage",
  "department.view"
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "מנהל מערכת",
  SENIOR_MANAGER: "מנהל/ת",
  DEPARTMENT_MANAGER: "מנהל מחלקה",
  TEAM_LEAD: "ראש צוות",
  EXPERT: "מומחה תמיכה",
  EMPLOYEE: "עובד/ת"
};

export const PERMISSION_LABELS: Record<Permission, { label: string; description: string }> = {
  "schedule.edit": { label: "עריכת סידור", description: "שיבוץ והסרה של עובדים במשמרות" },
  "schedule.publish": { label: "פרסום סידור", description: "פרסום השבוע ושליחת התראה לצוות" },
  "requests.approve": { label: "אישור בקשות", description: "אישור החלפות, מסירות וחופשות" },
  "reports.view": { label: "צפייה בנתונים", description: "גישה למסך התובנות והגרפים" },
  "shifts.configure": { label: "הגדרת משמרות", description: "יצירה ועריכה של סוגי המשמרות של הצוות" },
  "people.manage": { label: "ניהול עובדים", description: "הוספה ועריכה של עובדים בצוות" },
  "department.view": { label: "צפייה בכל המחלקה", description: "צפייה בסידור של כל הצוותים במחלקה" }
};

export const ROLE_DEFAULTS: Record<Role, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  SENIOR_MANAGER: PERMISSIONS,
  DEPARTMENT_MANAGER: PERMISSIONS,
  TEAM_LEAD: ["schedule.edit", "schedule.publish", "requests.approve", "reports.view"],
  EXPERT: [],
  EMPLOYEE: []
};

/** Higher number = more authority. Used so nobody creates or edits someone above them. */
const ROLE_RANK: Record<Role, number> = {
  ADMIN: 5,
  SENIOR_MANAGER: 4,
  DEPARTMENT_MANAGER: 3,
  TEAM_LEAD: 2,
  EXPERT: 1,
  EMPLOYEE: 0
};

/** Roles that work shifts. */
export function isSchedulable(role: Role): boolean {
  return role === "EMPLOYEE" || role === "EXPERT" || role === "TEAM_LEAD";
}

/** Roles that belong to a team (and take its department). */
export function belongsToTeam(role: Role): boolean {
  return isSchedulable(role);
}

/** Roles whose scope is every team. */
export function seesEverything(role: Role): boolean {
  return role === "ADMIN" || role === "SENIOR_MANAGER";
}

export interface Actor {
  id: string;
  role: Role;
  departmentId: string | null;
  teamId: string | null;
  extraPermissions: readonly Permission[];
}

export interface TeamRef {
  id: string;
  departmentId: string;
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && (PERMISSIONS as readonly string[]).includes(value);
}

export function effectivePermissions(actor: Actor): Set<Permission> {
  return new Set([...ROLE_DEFAULTS[actor.role], ...actor.extraPermissions]);
}

export function hasPermission(actor: Actor, permission: Permission): boolean {
  return effectivePermissions(actor).has(permission);
}

/** Whether the team is inside the actor's management scope (ignores permissions). */
export function isInScope(actor: Actor, team: TeamRef): boolean {
  if (seesEverything(actor.role)) {
    return true;
  }
  if (actor.role === "DEPARTMENT_MANAGER") {
    return actor.departmentId !== null && team.departmentId === actor.departmentId;
  }
  return actor.teamId === team.id;
}

/** The actor holds the permission and the team is in their scope. */
export function can(actor: Actor, permission: Permission, team: TeamRef): boolean {
  return hasPermission(actor, permission) && isInScope(actor, team);
}

/** Teams whose schedule the actor may see. Experts work across teams, so they see all of them. */
export function visibleTeams<T extends TeamRef>(actor: Actor, teams: T[]): T[] {
  return teams.filter(
    (team) =>
      isInScope(actor, team) ||
      actor.role === "EXPERT" ||
      (hasPermission(actor, "department.view") &&
        actor.departmentId !== null &&
        team.departmentId === actor.departmentId)
  );
}

/** Teams where the actor holds the permission. */
export function teamsWithPermission<T extends TeamRef>(actor: Actor, permission: Permission, teams: T[]): T[] {
  return hasPermission(actor, permission) ? teams.filter((team) => isInScope(actor, team)) : [];
}

/** Roles the actor may give to people they create or edit. */
export function assignableRoles(actor: Actor): Role[] {
  if (actor.role === "ADMIN") {
    return [...ROLES];
  }
  return ROLES.filter((role) => ROLE_RANK[role] < ROLE_RANK[actor.role]);
}

/**
 * Whether the actor may create or edit this person: they need people.manage, the person's
 * team must be in scope, and the person's role must be below the actor's (admins excepted).
 */
export function canManagePerson(
  actor: Actor,
  person: { id: string; role: Role; departmentId: string | null; teamId: string | null },
  teams: TeamRef[]
): boolean {
  if (actor.role === "ADMIN") {
    return true;
  }
  if (!hasPermission(actor, "people.manage") || person.id === actor.id) {
    return false;
  }
  if (!assignableRoles(actor).includes(person.role)) {
    return false;
  }
  const team = teams.find((candidate) => candidate.id === person.teamId);
  if (team) {
    return isInScope(actor, team);
  }
  // Someone without a team (a manager): senior managers may manage them anywhere, a
  // department manager only inside their department.
  if (actor.role === "SENIOR_MANAGER") {
    return true;
  }
  return actor.role === "DEPARTMENT_MANAGER" && person.departmentId === actor.departmentId;
}

/** Only admins switch per-person permissions on or off. */
export function canEditPermissions(actor: Actor): boolean {
  return actor.role === "ADMIN";
}
