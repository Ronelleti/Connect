import { isPermission, isRole, type Permission, type Role } from "@/lib/permissions";
import type { Department, Team } from "@/lib/types";
import { isUuid } from "./api";
import { cleanName } from "./validation";

export interface ParsedPerson {
  email?: string;
  name?: string;
  role?: Role;
  departmentId?: string | null;
  teamId?: string | null;
  title?: string;
  weeklyMinHours?: number;
  weeklyMaxHours?: number;
  isActive?: boolean;
  password?: string;
  extraPermissions?: Permission[];
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD_LENGTH = 10;

/** Parses the fields present in the body. Returns an error message for the first bad field. */
export function parsePersonBody(body: Record<string, unknown>): { value: ParsedPerson; error: string | null } {
  const value: ParsedPerson = {};
  if (body.email !== undefined) {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!EMAIL_PATTERN.test(email) || email.length > 120) {
      return { value, error: "כתובת אימייל לא תקינה." };
    }
    value.email = email;
  }
  if (body.name !== undefined) {
    const name = cleanName(body.name, 80);
    if (!name) {
      return { value, error: "יש להזין שם." };
    }
    value.name = name;
  }
  if (body.role !== undefined) {
    if (!isRole(body.role)) {
      return { value, error: "תפקיד לא תקין." };
    }
    value.role = body.role;
  }
  for (const key of ["departmentId", "teamId"] as const) {
    if (body[key] !== undefined) {
      if (body[key] !== null && body[key] !== "" && !isUuid(body[key])) {
        return { value, error: "צוות או מחלקה לא תקינים." };
      }
      value[key] = body[key] ? (body[key] as string) : null;
    }
  }
  if (body.title !== undefined) {
    value.title = typeof body.title === "string" ? body.title.trim().slice(0, 60) : "";
  }
  for (const key of ["weeklyMinHours", "weeklyMaxHours"] as const) {
    if (body[key] !== undefined) {
      const hours = Number(body[key]);
      if (!Number.isInteger(hours) || hours < 0 || hours > 80) {
        return { value, error: "שעות שבועיות חייבות להיות מספר שלם בין 0 ל-80." };
      }
      value[key] = hours;
    }
  }
  if (body.isActive !== undefined) {
    value.isActive = Boolean(body.isActive);
  }
  if (body.password !== undefined && body.password !== "") {
    if (typeof body.password !== "string" || body.password.length < MIN_PASSWORD_LENGTH) {
      return { value, error: `הסיסמה חייבת להכיל לפחות ${MIN_PASSWORD_LENGTH} תווים.` };
    }
    value.password = body.password;
  }
  if (body.extraPermissions !== undefined) {
    if (!Array.isArray(body.extraPermissions) || !body.extraPermissions.every(isPermission)) {
      return { value, error: "הרשאות לא תקינות." };
    }
    value.extraPermissions = Array.from(new Set(body.extraPermissions as Permission[]));
  }
  return { value, error: null };
}

/**
 * Settles department/team for the role: team members (team lead, employee) need a team and
 * take its department; a department manager needs a department and has no team; an admin
 * may have neither.
 */
export function resolvePlacement(
  role: Role,
  departmentId: string | null,
  teamId: string | null,
  departments: Department[],
  teams: Team[]
): { departmentId: string | null; teamId: string | null; error: string | null } {
  if (role === "TEAM_LEAD" || role === "EMPLOYEE") {
    const team = teams.find((candidate) => candidate.id === teamId);
    if (!team) {
      return { departmentId, teamId, error: "יש לבחור צוות." };
    }
    return { departmentId: team.departmentId, teamId: team.id, error: null };
  }
  if (role === "DEPARTMENT_MANAGER") {
    if (!departments.some((department) => department.id === departmentId)) {
      return { departmentId, teamId, error: "יש לבחור מחלקה." };
    }
    return { departmentId, teamId: null, error: null };
  }
  const team = teams.find((candidate) => candidate.id === teamId);
  return { departmentId: team?.departmentId ?? departmentId ?? null, teamId: team?.id ?? null, error: null };
}
