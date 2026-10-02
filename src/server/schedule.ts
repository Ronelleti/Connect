import { normalizeTime } from "@/lib/shiftTime";
import type { Assignment, AvailabilityEntry, AvailabilityStatus } from "@/lib/types";
import { getPool, query } from "./db";

interface AssignmentRow {
  id: string;
  user_id: string;
  shift_template_id: string;
  team_id: string;
  work_date: string;
  starts_at: string;
  ends_at: string;
}

interface AvailabilityRow {
  id: string;
  user_id: string;
  work_date: string;
  shift_template_id: string | null;
  status: AvailabilityStatus;
  note: string;
}

export function toAssignment(row: AssignmentRow): Assignment {
  return {
    id: row.id,
    userId: row.user_id,
    shiftTemplateId: row.shift_template_id,
    teamId: row.team_id,
    workDate: row.work_date,
    startsAt: normalizeTime(row.starts_at),
    endsAt: normalizeTime(row.ends_at)
  };
}

function toAvailability(row: AvailabilityRow): AvailabilityEntry {
  return {
    id: row.id,
    userId: row.user_id,
    workDate: row.work_date,
    shiftTemplateId: row.shift_template_id,
    status: row.status,
    note: row.note
  };
}

/** Assignments of the given teams with work dates in [from, to). */
export async function listTeamAssignments(teamIds: string[], from: string, to: string) {
  const rows = await query<AssignmentRow>(
    `SELECT * FROM shift_assignments
     WHERE team_id = ANY($1::uuid[]) AND work_date >= $2 AND work_date < $3
     ORDER BY work_date, starts_at`,
    [teamIds, from, to]
  );
  return rows.map(toAssignment);
}

/** Assignments of the given people (in any team) with work dates in [from, to). */
export async function listUserAssignments(userIds: string[], from: string, to: string) {
  const rows = await query<AssignmentRow>(
    `SELECT * FROM shift_assignments
     WHERE user_id = ANY($1::uuid[]) AND work_date >= $2 AND work_date < $3
     ORDER BY work_date, starts_at`,
    [userIds, from, to]
  );
  return rows.map(toAssignment);
}

export async function findAssignment(id: string) {
  const [row] = await query<AssignmentRow>("SELECT * FROM shift_assignments WHERE id = $1", [id]);
  return row ? toAssignment(row) : null;
}

export async function createAssignments(
  items: { userId: string; shiftTemplateId: string; teamId: string; workDate: string; startsAt: string; endsAt: string }[],
  createdBy: string
) {
  if (items.length === 0) {
    return [];
  }
  const rows = await query<AssignmentRow>(
    `INSERT INTO shift_assignments (user_id, shift_template_id, team_id, work_date, starts_at, ends_at, created_by)
     SELECT item.user_id, item.shift_template_id, item.team_id, item.work_date, item.starts_at, item.ends_at, $2
     FROM jsonb_to_recordset($1::jsonb) AS item(
       user_id uuid, shift_template_id uuid, team_id uuid, work_date date, starts_at time, ends_at time
     )
     ON CONFLICT (user_id, work_date, shift_template_id) DO NOTHING
     RETURNING *`,
    [
      JSON.stringify(
        items.map((item) => ({
          user_id: item.userId,
          shift_template_id: item.shiftTemplateId,
          team_id: item.teamId,
          work_date: item.workDate,
          starts_at: item.startsAt,
          ends_at: item.endsAt
        }))
      ),
      createdBy
    ]
  );
  return rows.map(toAssignment);
}

/** Removes a shift; open swaps involving it are cancelled (its giveaways go with it). */
export async function deleteAssignment(id: string) {
  await query(
    `UPDATE swap_requests SET status = 'CANCELLED'
     WHERE status IN ('PENDING_EMPLOYEE', 'PENDING_MANAGER')
       AND (requester_assignment_id = $1 OR target_assignment_id = $1)`,
    [id]
  );
  await query("DELETE FROM shift_assignments WHERE id = $1", [id]);
}

export async function listAvailability(userIds: string[], from: string, to: string) {
  const rows = await query<AvailabilityRow>(
    `SELECT * FROM availability_entries
     WHERE user_id = ANY($1::uuid[]) AND work_date >= $2 AND work_date < $3
     ORDER BY work_date`,
    [userIds, from, to]
  );
  return rows.map(toAvailability);
}

/**
 * Sets (or clears, with status null) one availability entry: for a shift, or for the
 * whole day when shiftTemplateId is null. Marking a whole day as time off replaces that
 * day's per-shift entries.
 */
export async function setAvailability(input: {
  userId: string;
  workDate: string;
  shiftTemplateId: string | null;
  status: AvailabilityStatus | null;
  note?: string;
}) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    if (input.shiftTemplateId) {
      await client.query(
        "DELETE FROM availability_entries WHERE user_id = $1 AND work_date = $2 AND shift_template_id = $3",
        [input.userId, input.workDate, input.shiftTemplateId]
      );
    } else {
      await client.query(
        `DELETE FROM availability_entries WHERE user_id = $1 AND work_date = $2
         AND (shift_template_id IS NULL OR $3::text = 'TIME_OFF')`,
        [input.userId, input.workDate, input.status]
      );
    }
    if (input.status) {
      await client.query(
        `INSERT INTO availability_entries (user_id, work_date, shift_template_id, status, note)
         VALUES ($1, $2, $3, $4, $5)`,
        [input.userId, input.workDate, input.shiftTemplateId, input.status, input.note ?? ""]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function markAvailabilitySubmitted(userId: string, weekStart: string) {
  await query(
    `INSERT INTO availability_submissions (user_id, week_start) VALUES ($1, $2)
     ON CONFLICT (user_id, week_start) DO UPDATE SET submitted_at = now()`,
    [userId, weekStart]
  );
}

export async function isAvailabilitySubmitted(userId: string, weekStart: string) {
  const [row] = await query<{ found: boolean }>(
    "SELECT true AS found FROM availability_submissions WHERE user_id = $1 AND week_start = $2",
    [userId, weekStart]
  );
  return Boolean(row);
}

/** Active team members who haven't finished the week's availability. */
export async function listUserIdsMissingAvailability(weekStart: string) {
  const rows = await query<{ id: string }>(
    `SELECT id FROM users
     WHERE is_active AND team_id IS NOT NULL AND role IN ('EMPLOYEE', 'TEAM_LEAD')
       AND id NOT IN (SELECT user_id FROM availability_submissions WHERE week_start = $1)`,
    [weekStart]
  );
  return rows.map((row) => row.id);
}

export async function listPublishedWeeks(teamIds: string[], weekStart: string) {
  const rows = await query<{ team_id: string; published_at: string | Date }>(
    "SELECT team_id, published_at FROM published_weeks WHERE team_id = ANY($1::uuid[]) AND week_start = $2",
    [teamIds, weekStart]
  );
  return new Map(rows.map((row) => [row.team_id, new Date(row.published_at).toISOString()]));
}

export async function recordPublishedWeek(teamId: string, weekStart: string, publishedBy: string) {
  const [row] = await query<{ published_at: string | Date; was_published: boolean }>(
    `WITH previous AS (SELECT 1 FROM published_weeks WHERE team_id = $1 AND week_start = $2)
     INSERT INTO published_weeks (team_id, week_start, published_at, published_by)
     VALUES ($1, $2, now(), $3)
     ON CONFLICT (team_id, week_start) DO UPDATE SET
       published_at = EXCLUDED.published_at,
       published_by = EXCLUDED.published_by
     RETURNING published_at, EXISTS (SELECT 1 FROM previous) AS was_published`,
    [teamId, weekStart, publishedBy]
  );
  return { publishedAt: new Date(row.published_at).toISOString(), wasPublished: row.was_published };
}

export interface NamedAssignment extends Assignment {
  shiftName: string;
  teamName: string;
}

/** A person's shifts with the shift and team names, work dates in [from, to). */
export async function listNamedUserAssignments(userIds: string[], from: string, to: string): Promise<NamedAssignment[]> {
  const rows = await query<AssignmentRow & { shift_name: string; team_name: string }>(
    `SELECT assignments.*, templates.name AS shift_name, teams.name AS team_name
     FROM shift_assignments assignments
     JOIN shift_templates templates ON templates.id = assignments.shift_template_id
     JOIN teams ON teams.id = assignments.team_id
     WHERE assignments.user_id = ANY($1::uuid[]) AND assignments.work_date >= $2 AND assignments.work_date < $3
     ORDER BY assignments.work_date, assignments.starts_at`,
    [userIds, from, to]
  );
  return rows.map((row) => ({ ...toAssignment(row), shiftName: row.shift_name, teamName: row.team_name }));
}
