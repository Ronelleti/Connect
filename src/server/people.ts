import { isPermission, type Permission, type Role } from "@/lib/permissions";
import type { Person, User } from "@/lib/types";
import { query } from "./db";

interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: Role;
  department_id: string | null;
  team_id: string | null;
  title: string;
  weekly_min_hours: number;
  weekly_max_hours: number;
  is_active: boolean;
  permissions: string[] | null;
}

const USER_SELECT = `
  SELECT users.*,
         COALESCE(
           (SELECT array_agg(permission ORDER BY permission) FROM user_permissions WHERE user_id = users.id),
           '{}'
         ) AS permissions
  FROM users`;

function toPerson(row: UserRow): Person {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    departmentId: row.department_id,
    teamId: row.team_id,
    title: row.title,
    weeklyMinHours: row.weekly_min_hours,
    weeklyMaxHours: row.weekly_max_hours,
    isActive: row.is_active,
    extraPermissions: (row.permissions ?? []).filter(isPermission)
  };
}

export function toUser(person: Person): User {
  return {
    id: person.id,
    email: person.email,
    name: person.name,
    role: person.role,
    departmentId: person.departmentId,
    teamId: person.teamId,
    extraPermissions: person.extraPermissions
  };
}

export async function findLoginByEmail(email: string) {
  const [row] = await query<UserRow>(`${USER_SELECT} WHERE users.email = $1`, [email]);
  return row ? { person: toPerson(row), passwordHash: row.password_hash } : null;
}

export async function findPerson(id: string) {
  const [row] = await query<UserRow>(`${USER_SELECT} WHERE users.id = $1`, [id]);
  return row ? toPerson(row) : null;
}

export async function listPeople(filter: { teamIds?: string[]; departmentIds?: string[]; includeInactive?: boolean } = {}) {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (!filter.includeInactive) {
    conditions.push("users.is_active");
  }
  const scope: string[] = [];
  if (filter.teamIds) {
    values.push(filter.teamIds);
    scope.push(`users.team_id = ANY($${values.length}::uuid[])`);
  }
  if (filter.departmentIds) {
    values.push(filter.departmentIds);
    scope.push(`users.department_id = ANY($${values.length}::uuid[])`);
  }
  if (scope.length > 0) {
    conditions.push(`(${scope.join(" OR ")})`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await query<UserRow>(`${USER_SELECT} ${where} ORDER BY users.name`, values);
  return rows.map(toPerson);
}

export async function listAllActivePeople() {
  return listPeople({});
}

export interface PersonInput {
  email: string;
  name: string;
  role: Role;
  departmentId: string | null;
  teamId: string | null;
  title: string;
  weeklyMinHours: number;
  weeklyMaxHours: number;
}

export async function createPerson(input: PersonInput & { passwordHash: string }) {
  const [row] = await query<{ id: string }>(
    `INSERT INTO users (email, name, password_hash, role, department_id, team_id, title, weekly_min_hours, weekly_max_hours)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (email) DO NOTHING
     RETURNING id`,
    [
      input.email,
      input.name,
      input.passwordHash,
      input.role,
      input.departmentId,
      input.teamId,
      input.title,
      input.weeklyMinHours,
      input.weeklyMaxHours
    ]
  );
  return row ? findPerson(row.id) : null;
}

export async function updatePerson(
  id: string,
  input: Partial<PersonInput> & { isActive?: boolean; passwordHash?: string }
) {
  const columns: Record<string, unknown> = {
    email: input.email,
    name: input.name,
    role: input.role,
    department_id: input.departmentId,
    team_id: input.teamId,
    title: input.title,
    weekly_min_hours: input.weeklyMinHours,
    weekly_max_hours: input.weeklyMaxHours,
    is_active: input.isActive,
    password_hash: input.passwordHash
  };
  const entries = Object.entries(columns).filter(([, value]) => value !== undefined);
  if (entries.length > 0) {
    const assignments = entries.map(([column], index) => `${column} = $${index + 2}`).join(", ");
    try {
      await query(`UPDATE users SET ${assignments} WHERE id = $1`, [id, ...entries.map(([, value]) => value)]);
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        return null;
      }
      throw error;
    }
  }
  return findPerson(id);
}

export async function setExtraPermissions(userId: string, permissions: Permission[]) {
  await query("DELETE FROM user_permissions WHERE user_id = $1", [userId]);
  if (permissions.length > 0) {
    await query(
      "INSERT INTO user_permissions (user_id, permission) SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING",
      [userId, permissions]
    );
  }
}

export async function isLoginRateLimited(attemptKey: string) {
  const [row] = await query<{ blocked: boolean }>(
    `SELECT failed_count >= 5
            AND first_failed_at > now() - interval '15 minutes' AS blocked
     FROM auth_login_attempts
     WHERE attempt_key = $1`,
    [attemptKey]
  );
  return row?.blocked ?? false;
}

export async function recordLoginFailure(attemptKey: string) {
  await query(
    `INSERT INTO auth_login_attempts (attempt_key, failed_count, first_failed_at, last_failed_at)
     VALUES ($1, 1, now(), now())
     ON CONFLICT (attempt_key) DO UPDATE SET
       failed_count = CASE
         WHEN auth_login_attempts.first_failed_at <= now() - interval '15 minutes' THEN 1
         ELSE auth_login_attempts.failed_count + 1
       END,
       first_failed_at = CASE
         WHEN auth_login_attempts.first_failed_at <= now() - interval '15 minutes' THEN now()
         ELSE auth_login_attempts.first_failed_at
       END,
       last_failed_at = now()`,
    [attemptKey]
  );
}

export async function clearLoginFailures(attemptKey: string) {
  await query("DELETE FROM auth_login_attempts WHERE attempt_key = $1", [attemptKey]);
}
