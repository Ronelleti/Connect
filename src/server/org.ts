import { normalizeTime } from "@/lib/shiftTime";
import type { Department, ShiftTemplate, Team } from "@/lib/types";
import { query } from "./db";

interface TeamRow {
  id: string;
  department_id: string;
  name: string;
  color_slot: number;
}

interface ShiftTemplateRow {
  id: string;
  team_id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  required_count: number;
  weekdays: number;
  sort_order: number;
  is_active: boolean;
}

function toTeam(row: TeamRow): Team {
  return { id: row.id, departmentId: row.department_id, name: row.name, colorSlot: row.color_slot };
}

function toShiftTemplate(row: ShiftTemplateRow): ShiftTemplate {
  return {
    id: row.id,
    teamId: row.team_id,
    name: row.name,
    startsAt: normalizeTime(row.starts_at),
    endsAt: normalizeTime(row.ends_at),
    requiredCount: row.required_count,
    weekdays: row.weekdays,
    sortOrder: row.sort_order,
    isActive: row.is_active
  };
}

function isUniqueViolation(error: unknown) {
  return (error as { code?: string }).code === "23505";
}

export async function listDepartments(): Promise<Department[]> {
  return query<Department>("SELECT id, name FROM departments ORDER BY name");
}

export async function createDepartment(name: string) {
  try {
    const [row] = await query<Department>("INSERT INTO departments (name) VALUES ($1) RETURNING id, name", [name]);
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) {
      return null;
    }
    throw error;
  }
}

export async function renameDepartment(id: string, name: string) {
  try {
    const [row] = await query<Department>("UPDATE departments SET name = $2 WHERE id = $1 RETURNING id, name", [id, name]);
    return row ?? null;
  } catch (error) {
    if (isUniqueViolation(error)) {
      return null;
    }
    throw error;
  }
}

/** Deletes an empty department. Returns false when it still has teams or people. */
export async function deleteDepartment(id: string) {
  const [usage] = await query<{ teams: number; people: number }>(
    `SELECT (SELECT count(*)::int FROM teams WHERE department_id = $1) AS teams,
            (SELECT count(*)::int FROM users WHERE department_id = $1) AS people`,
    [id]
  );
  if (!usage || usage.teams > 0 || usage.people > 0) {
    return false;
  }
  await query("DELETE FROM departments WHERE id = $1", [id]);
  return true;
}

export async function listTeams(): Promise<Team[]> {
  const rows = await query<TeamRow>("SELECT * FROM teams ORDER BY name");
  return rows.map(toTeam);
}

export async function findTeam(id: string) {
  const [row] = await query<TeamRow>("SELECT * FROM teams WHERE id = $1", [id]);
  return row ? toTeam(row) : null;
}

export async function createTeam(input: { departmentId: string; name: string; colorSlot?: number }) {
  try {
    // A new team takes the first color no other team uses yet, so team colors stay distinct.
    const [row] = await query<TeamRow>(
      `INSERT INTO teams (department_id, name, color_slot)
       VALUES ($1, $2, COALESCE($3, (
         SELECT COALESCE(min(slot), 1) FROM generate_series(1, 8) AS slot
         WHERE slot NOT IN (SELECT color_slot FROM teams)
       )))
       RETURNING *`,
      [input.departmentId, input.name, input.colorSlot ?? null]
    );
    return toTeam(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return null;
    }
    throw error;
  }
}

export async function updateTeam(id: string, input: { name?: string; colorSlot?: number }) {
  try {
    const [row] = await query<TeamRow>(
      "UPDATE teams SET name = COALESCE($2, name), color_slot = COALESCE($3, color_slot) WHERE id = $1 RETURNING *",
      [id, input.name ?? null, input.colorSlot ?? null]
    );
    return row ? toTeam(row) : null;
  } catch (error) {
    if (isUniqueViolation(error)) {
      return null;
    }
    throw error;
  }
}

/** Deletes a team with no members and no schedule history. */
export async function deleteTeam(id: string) {
  const [usage] = await query<{ people: number; shifts: number }>(
    `SELECT (SELECT count(*)::int FROM users WHERE team_id = $1) AS people,
            (SELECT count(*)::int FROM shift_assignments WHERE team_id = $1) AS shifts`,
    [id]
  );
  if (!usage || usage.people > 0 || usage.shifts > 0) {
    return false;
  }
  await query("DELETE FROM teams WHERE id = $1", [id]);
  return true;
}

export async function listShiftTemplates(teamIds: string[], includeArchived = false) {
  const rows = await query<ShiftTemplateRow>(
    `SELECT * FROM shift_templates
     WHERE team_id = ANY($1::uuid[]) ${includeArchived ? "" : "AND is_active"}
     ORDER BY sort_order, starts_at, name`,
    [teamIds]
  );
  return rows.map(toShiftTemplate);
}

export async function findShiftTemplate(id: string) {
  const [row] = await query<ShiftTemplateRow>("SELECT * FROM shift_templates WHERE id = $1", [id]);
  return row ? toShiftTemplate(row) : null;
}

export interface ShiftTemplateInput {
  name: string;
  startsAt: string;
  endsAt: string;
  requiredCount: number;
  weekdays: number;
  sortOrder: number;
}

export async function createShiftTemplate(teamId: string, input: ShiftTemplateInput) {
  const [row] = await query<ShiftTemplateRow>(
    `INSERT INTO shift_templates (team_id, name, starts_at, ends_at, required_count, weekdays, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [teamId, input.name, input.startsAt, input.endsAt, input.requiredCount, input.weekdays, input.sortOrder]
  );
  return toShiftTemplate(row);
}

export async function updateShiftTemplate(id: string, input: Partial<ShiftTemplateInput> & { isActive?: boolean }) {
  const [row] = await query<ShiftTemplateRow>(
    `UPDATE shift_templates SET
       name = COALESCE($2, name),
       starts_at = COALESCE($3::time, starts_at),
       ends_at = COALESCE($4::time, ends_at),
       required_count = COALESCE($5, required_count),
       weekdays = COALESCE($6, weekdays),
       sort_order = COALESCE($7, sort_order),
       is_active = COALESCE($8, is_active)
     WHERE id = $1
     RETURNING *`,
    [
      id,
      input.name ?? null,
      input.startsAt ?? null,
      input.endsAt ?? null,
      input.requiredCount ?? null,
      input.weekdays ?? null,
      input.sortOrder ?? null,
      input.isActive ?? null
    ]
  );
  return row ? toShiftTemplate(row) : null;
}
