import { addDays, diffDays } from "@/lib/dates";
import { getShiftStartInstant } from "@/lib/shifts";
import type { ShiftType } from "@/lib/types";
import { getPool, query } from "./db";

export type GiveawayStatus = "OPEN" | "PENDING_MANAGER" | "APPROVED" | "DECLINED_BY_MANAGER" | "CANCELLED";
export type VacationStatus = "PENDING" | "APPROVED" | "DECLINED" | "CANCELLED";

export interface ShiftGiveaway {
  id: string;
  status: GiveawayStatus;
  assignmentId: string;
  weekStart: string;
  dayIndex: number;
  shiftType: ShiftType;
  offeredByEmployeeId: string;
  offeredByName: string;
  takenByEmployeeId: string | null;
  takenByName: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface VacationRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  startDate: string;
  endDate: string;
  note: string;
  status: VacationStatus;
  removedShiftCount: number;
  createdAt: string;
  decidedAt: string | null;
}

export interface RemovedShift {
  weekStart: string;
  dayIndex: number;
  shiftType: ShiftType;
}

interface GiveawayRow {
  id: string;
  status: GiveawayStatus;
  assignment_id: string;
  week_start: string | Date;
  day_index: number;
  shift_type: ShiftType;
  offered_by_employee_id: string;
  offered_by_name: string;
  taken_by_employee_id: string | null;
  taken_by_name: string | null;
  created_at: string | Date;
  decided_at: string | Date | null;
}

interface VacationRow {
  id: string;
  employee_id: string;
  employee_name: string;
  start_date: string | Date;
  end_date: string | Date;
  note: string;
  status: VacationStatus;
  removed_shift_count: number;
  created_at: string | Date;
  decided_at: string | Date | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

const ACTIVE_GIVEAWAY_STATUSES = ["OPEN", "PENDING_MANAGER"];

const GIVEAWAY_SELECT = `
  SELECT g.id, g.status, g.assignment_id, g.offered_by_employee_id, g.taken_by_employee_id,
         g.created_at, g.decided_at,
         a.week_start, a.day_index, a.shift_type,
         offered.name AS offered_by_name, taken.name AS taken_by_name
  FROM shift_giveaways g
  JOIN shift_assignments a ON a.id = g.assignment_id
  JOIN employees offered ON offered.id = g.offered_by_employee_id
  LEFT JOIN employees taken ON taken.id = g.taken_by_employee_id`;

// Active giveaways plus the ones decided in the last 30 days, soonest shift first.
export async function listGiveaways(): Promise<ShiftGiveaway[]> {
  const rows = await query<GiveawayRow>(
    `${GIVEAWAY_SELECT}
     WHERE g.status = ANY($1::text[]) OR g.decided_at > now() - interval '30 days'
     ORDER BY (a.week_start + a.day_index),
       CASE a.shift_type WHEN 'MORNING' THEN 0 WHEN 'EVENING' THEN 1 ELSE 2 END`,
    [ACTIVE_GIVEAWAY_STATUSES]
  );
  return rows.map(toGiveaway);
}

export async function findGiveaway(id: string): Promise<ShiftGiveaway | null> {
  const [row] = await query<GiveawayRow>(`${GIVEAWAY_SELECT} WHERE g.id = $1`, [id]);
  return row ? toGiveaway(row) : null;
}

export async function listActiveGiveawayAssignmentIds(): Promise<string[]> {
  const rows = await query<{ assignment_id: string }>(
    "SELECT assignment_id FROM shift_giveaways WHERE status = ANY($1::text[])",
    [ACTIVE_GIVEAWAY_STATUSES]
  );
  return rows.map((row) => row.assignment_id);
}

// Returns null when the shift is already offered.
export async function createGiveaway(assignmentId: string, employeeId: string) {
  const [row] = await query<{ id: string }>(
    `INSERT INTO shift_giveaways (assignment_id, offered_by_employee_id)
     VALUES ($1, $2)
     ON CONFLICT (assignment_id) WHERE status IN ('OPEN', 'PENDING_MANAGER') DO NOTHING
     RETURNING id`,
    [assignmentId, employeeId]
  );
  return row ? findGiveaway(row.id) : null;
}

export async function takeGiveaway(id: string, takerEmployeeId: string) {
  const [row] = await query<{ id: string }>(
    `UPDATE shift_giveaways
     SET status = 'PENDING_MANAGER', taken_by_employee_id = $2, taken_at = now()
     WHERE id = $1 AND status = 'OPEN' AND offered_by_employee_id <> $2
     RETURNING id`,
    [id, takerEmployeeId]
  );
  return row ? findGiveaway(row.id) : null;
}

export async function cancelGiveaway(id: string) {
  const [row] = await query<{ id: string }>(
    `UPDATE shift_giveaways SET status = 'CANCELLED', decided_at = now()
     WHERE id = $1 AND status = ANY($2::text[])
     RETURNING id`,
    [id, ACTIVE_GIVEAWAY_STATUSES]
  );
  return row ? findGiveaway(row.id) : null;
}

export async function declineGiveaway(id: string) {
  const [row] = await query<{ id: string }>(
    `UPDATE shift_giveaways SET status = 'DECLINED_BY_MANAGER', decided_at = now()
     WHERE id = $1 AND status = 'PENDING_MANAGER'
     RETURNING id`,
    [id]
  );
  return row ? findGiveaway(row.id) : null;
}

// Hands the shift over to the employee who took it. Returns null if the giveaway is no
// longer waiting for approval or the shift no longer belongs to the employee who offered it.
export async function approveGiveaway(id: string) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const giveawayResult = await client.query<{
      assignment_id: string;
      offered_by_employee_id: string;
      taken_by_employee_id: string | null;
    }>(
      `SELECT assignment_id, offered_by_employee_id, taken_by_employee_id
       FROM shift_giveaways WHERE id = $1 AND status = 'PENDING_MANAGER' FOR UPDATE`,
      [id]
    );
    const giveaway = giveawayResult.rows[0];
    const assignmentResult = giveaway
      ? await client.query<{ employee_id: string }>(
          "SELECT employee_id FROM shift_assignments WHERE id = $1 FOR UPDATE",
          [giveaway.assignment_id]
        )
      : null;
    if (
      !giveaway?.taken_by_employee_id ||
      assignmentResult?.rows[0]?.employee_id !== giveaway.offered_by_employee_id
    ) {
      await client.query("ROLLBACK");
      return null;
    }

    await client.query("UPDATE shift_assignments SET employee_id = $2 WHERE id = $1", [
      giveaway.assignment_id,
      giveaway.taken_by_employee_id
    ]);
    await supersedeSwapsForAssignments(client, [giveaway.assignment_id]);
    await client.query(
      "UPDATE shift_giveaways SET status = 'APPROVED', decided_at = now() WHERE id = $1",
      [id]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return findGiveaway(id);
}

const VACATION_SELECT = `
  SELECT v.*, e.name AS employee_name
  FROM vacation_requests v
  JOIN employees e ON e.id = v.employee_id`;

// All requests for one employee, or (without an employee) every pending request plus
// those decided in the last 60 days, for managers.
export async function listVacationRequests(employeeId?: string): Promise<VacationRequest[]> {
  const rows = employeeId
    ? await query<VacationRow>(
        `${VACATION_SELECT} WHERE v.employee_id = $1 ORDER BY v.start_date DESC LIMIT 50`,
        [employeeId]
      )
    : await query<VacationRow>(
        `${VACATION_SELECT}
         WHERE v.status = 'PENDING' OR v.decided_at > now() - interval '60 days'
         ORDER BY (v.status = 'PENDING') DESC, v.start_date ASC`
      );
  return rows.map(toVacation);
}

export async function findVacationRequest(id: string): Promise<VacationRequest | null> {
  const [row] = await query<VacationRow>(`${VACATION_SELECT} WHERE v.id = $1`, [id]);
  return row ? toVacation(row) : null;
}

export async function createVacationRequest(input: {
  employeeId: string;
  startDate: string;
  endDate: string;
  note: string;
}) {
  const [row] = await query<{ id: string }>(
    `INSERT INTO vacation_requests (employee_id, start_date, end_date, note)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [input.employeeId, input.startDate, input.endDate, input.note]
  );
  return findVacationRequest(row.id);
}

export async function closeVacationRequest(id: string, status: "DECLINED" | "CANCELLED") {
  const [row] = await query<{ id: string }>(
    `UPDATE vacation_requests SET status = $2, decided_at = now()
     WHERE id = $1 AND status = 'PENDING' RETURNING id`,
    [id, status]
  );
  return row ? findVacationRequest(row.id) : null;
}

// Marks every day of the vacation as full-day time off (so scheduling skips it) and
// removes the employee's shifts on those days, leaving them empty for the manager.
export async function approveVacationRequest(id: string) {
  const client = await getPool().connect();
  let removedShifts: RemovedShift[] = [];
  try {
    await client.query("BEGIN");
    const requestResult = await client.query<VacationRow>(
      "SELECT * FROM vacation_requests WHERE id = $1 AND status = 'PENDING' FOR UPDATE",
      [id]
    );
    const request = requestResult.rows[0];
    if (!request) {
      await client.query("ROLLBACK");
      return null;
    }
    const startDate = toDateOnlyString(request.start_date);
    const endDate = toDateOnlyString(request.end_date);

    for (let offset = 0; offset <= diffDays(startDate, endDate); offset += 1) {
      const date = addDays(startDate, offset);
      const dayIndex = new Date(`${date}T00:00:00.000Z`).getUTCDay();
      await client.query(
        `INSERT INTO availability_blocks (employee_id, week_start, day_index, reason, status)
         VALUES ($1, $2, $3, 'חופשה מאושרת', 'TIME_OFF')
         ON CONFLICT (employee_id, week_start, day_index) WHERE status = 'TIME_OFF' DO NOTHING`,
        [request.employee_id, addDays(date, -dayIndex), dayIndex]
      );
    }

    const removedResult = await client.query<{
      id: string;
      week_start: string | Date;
      day_index: number;
      shift_type: ShiftType;
    }>(
      `SELECT id, week_start, day_index, shift_type FROM shift_assignments
       WHERE employee_id = $1
         AND (week_start + day_index) BETWEEN $2::date AND $3::date
       ORDER BY (week_start + day_index)`,
      [request.employee_id, startDate, endDate]
    );
    // Only shifts that haven't started yet are removed: if the approval comes late,
    // shifts the employee already worked stay in the schedule (and in their pay).
    const now = new Date();
    const upcomingRows = removedResult.rows.filter(
      (row) => getShiftStartInstant(toDateOnlyString(row.week_start), row.day_index, row.shift_type) > now
    );
    const removedIds = upcomingRows.map((row) => row.id);
    removedShifts = upcomingRows.map((row) => ({
      weekStart: toDateOnlyString(row.week_start),
      dayIndex: row.day_index,
      shiftType: row.shift_type
    }));
    if (removedIds.length > 0) {
      await supersedeSwapsForAssignments(client, removedIds);
      await client.query("DELETE FROM shift_assignments WHERE id = ANY($1::uuid[])", [removedIds]);
    }

    await client.query(
      `UPDATE vacation_requests
       SET status = 'APPROVED', decided_at = now(), removed_shift_count = $2
       WHERE id = $1`,
      [id, removedIds.length]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  const request = await findVacationRequest(id);
  return request ? { request, removedShifts } : null;
}

async function supersedeSwapsForAssignments(
  client: import("pg").PoolClient,
  assignmentIds: string[]
) {
  await client.query(
    `UPDATE shift_swap_requests SET status = 'SUPERSEDED'
     WHERE status IN ('PENDING_EMPLOYEE', 'PENDING_MANAGER')
       AND (requester_assignment_id = ANY($1::uuid[]) OR target_assignment_id = ANY($1::uuid[]))`,
    [assignmentIds]
  );
}

function toGiveaway(row: GiveawayRow): ShiftGiveaway {
  return {
    id: row.id,
    status: row.status,
    assignmentId: row.assignment_id,
    weekStart: toDateOnlyString(row.week_start),
    dayIndex: row.day_index,
    shiftType: row.shift_type,
    offeredByEmployeeId: row.offered_by_employee_id,
    offeredByName: row.offered_by_name,
    takenByEmployeeId: row.taken_by_employee_id,
    takenByName: row.taken_by_name,
    createdAt: new Date(row.created_at).toISOString(),
    decidedAt: row.decided_at ? new Date(row.decided_at).toISOString() : null
  };
}

function toVacation(row: VacationRow): VacationRequest {
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    startDate: toDateOnlyString(row.start_date),
    endDate: toDateOnlyString(row.end_date),
    note: row.note,
    status: row.status,
    removedShiftCount: row.removed_shift_count,
    createdAt: new Date(row.created_at).toISOString(),
    decidedAt: row.decided_at ? new Date(row.decided_at).toISOString() : null
  };
}

// pg returns DATE columns as local-midnight Date objects; format them without a UTC
// shift so a date never moves to the previous day.
function toDateOnlyString(value: string | Date): string {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${value.getFullYear()}-${month}-${day}`;
}

export async function markAvailabilitySubmitted(employeeId: string, weekStart: string) {
  await query(
    `INSERT INTO availability_submissions (employee_id, week_start)
     VALUES ($1, $2)
     ON CONFLICT (employee_id, week_start) DO UPDATE SET submitted_at = now()`,
    [employeeId, weekStart]
  );
}

export async function findAvailabilitySubmission(employeeId: string, weekStart: string) {
  const [row] = await query<{ submitted_at: string | Date }>(
    "SELECT submitted_at FROM availability_submissions WHERE employee_id = $1 AND week_start = $2",
    [employeeId, weekStart]
  );
  return row ? new Date(row.submitted_at).toISOString() : null;
}

// Active employees who can sign in and have neither confirmed nor changed their
// availability for the given week.
export async function listUserIdsMissingAvailability(weekStart: string): Promise<string[]> {
  const rows = await query<{ user_id: string }>(
    `SELECT e.user_id FROM employees e
     WHERE e.is_active AND e.user_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM availability_submissions s
         WHERE s.employee_id = e.id AND s.week_start = $1
       )
       AND NOT EXISTS (
         SELECT 1 FROM availability_blocks b
         WHERE b.employee_id = e.id AND b.week_start = $1
       )`,
    [weekStart]
  );
  return rows.map((row) => row.user_id);
}
