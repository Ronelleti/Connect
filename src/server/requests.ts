import type pg from "pg";
import { addDays, diffDays } from "@/lib/dates";
import { normalizeTime } from "@/lib/shiftTime";
import type { Giveaway, GiveawayStatus, SwapRequest, SwapStatus, VacationRequest, VacationStatus } from "@/lib/types";
import { getPool, query } from "./db";

async function inTransaction<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Thrown when a request can't be applied because the schedule changed underneath it. */
export class RequestConflictError extends Error {}

// ---------------------------------------------------------------- swaps

interface SwapRow {
  id: string;
  requester_assignment_id: string | null;
  target_assignment_id: string | null;
  requester_id: string;
  requester_name: string;
  target_user_id: string;
  target_user_name: string;
  team_id: string;
  shift_label: string;
  target_shift_label: string | null;
  status: SwapStatus;
  created_at: string | Date;
}

const SWAP_SELECT = `
  SELECT swaps.*, requester.name AS requester_name, target.name AS target_user_name
  FROM swap_requests swaps
  JOIN users requester ON requester.id = swaps.requester_id
  JOIN users target ON target.id = swaps.target_user_id`;

function toSwap(row: SwapRow): SwapRequest {
  return {
    id: row.id,
    requesterAssignmentId: row.requester_assignment_id,
    targetAssignmentId: row.target_assignment_id,
    requesterId: row.requester_id,
    requesterName: row.requester_name,
    targetUserId: row.target_user_id,
    targetUserName: row.target_user_name,
    teamId: row.team_id,
    shiftLabel: row.shift_label,
    targetShiftLabel: row.target_shift_label,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString()
  };
}

export async function findSwap(id: string) {
  const [row] = await query<SwapRow>(`${SWAP_SELECT} WHERE swaps.id = $1`, [id]);
  return row ? toSwap(row) : null;
}

/** Swaps the person is part of, plus those waiting for approval in the given teams (last 60 days). */
export async function listSwaps(userId: string, approverTeamIds: string[]) {
  const rows = await query<SwapRow>(
    `${SWAP_SELECT}
     WHERE (swaps.requester_id = $1 OR swaps.target_user_id = $1
            OR (swaps.team_id = ANY($2::uuid[]) AND swaps.status = 'PENDING_MANAGER'))
       AND swaps.created_at > now() - interval '60 days'
     ORDER BY swaps.created_at DESC`,
    [userId, approverTeamIds]
  );
  return rows.map(toSwap);
}

export async function createSwap(input: {
  requesterAssignmentId: string;
  targetAssignmentId: string | null;
  requesterId: string;
  targetUserId: string;
  teamId: string;
  shiftLabel: string;
  targetShiftLabel: string | null;
}) {
  try {
    const [row] = await query<{ id: string }>(
      `INSERT INTO swap_requests
         (requester_assignment_id, target_assignment_id, requester_id, target_user_id, team_id, shift_label, target_shift_label)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        input.requesterAssignmentId,
        input.targetAssignmentId,
        input.requesterId,
        input.targetUserId,
        input.teamId,
        input.shiftLabel,
        input.targetShiftLabel
      ]
    );
    return findSwap(row.id);
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return null;
    }
    throw error;
  }
}

export async function setSwapStatus(id: string, from: SwapStatus[], to: SwapStatus, decidedBy: string | null) {
  const column = to === "PENDING_MANAGER" || to === "DECLINED_BY_EMPLOYEE" ? "employee_decided_at" : "manager_decided_at";
  const [row] = await query<{ id: string }>(
    `UPDATE swap_requests SET status = $3, ${column} = now(), decided_by = COALESCE($4, decided_by)
     WHERE id = $1 AND status = ANY($2::text[])
     RETURNING id`,
    [id, from, to, decidedBy]
  );
  return row ? findSwap(row.id) : null;
}

/** Moves the shifts between the two people and marks the swap approved. */
export async function applySwap(swap: SwapRequest, decidedBy: string) {
  await inTransaction(async (client) => {
    const locked = await client.query(
      "SELECT status FROM swap_requests WHERE id = $1 AND status = 'PENDING_MANAGER' FOR UPDATE",
      [swap.id]
    );
    if (locked.rowCount === 0) {
      throw new RequestConflictError("הבקשה כבר טופלה.");
    }
    const moved = await client.query(
      "UPDATE shift_assignments SET user_id = $2 WHERE id = $1 AND user_id = $3",
      [swap.requesterAssignmentId, swap.targetUserId, swap.requesterId]
    );
    if (moved.rowCount === 0) {
      throw new RequestConflictError("המשמרת השתנתה מאז שהבקשה נשלחה.");
    }
    if (swap.targetAssignmentId) {
      const back = await client.query(
        "UPDATE shift_assignments SET user_id = $2 WHERE id = $1 AND user_id = $3",
        [swap.targetAssignmentId, swap.requesterId, swap.targetUserId]
      );
      if (back.rowCount === 0) {
        throw new RequestConflictError("המשמרת של העמית/ה השתנתה מאז שהבקשה נשלחה.");
      }
    }
    await client.query(
      "UPDATE swap_requests SET status = 'APPROVED', manager_decided_at = now(), decided_by = $2 WHERE id = $1",
      [swap.id, decidedBy]
    );
  }).catch((error) => {
    if ((error as { code?: string }).code === "23505") {
      throw new RequestConflictError("אחד העובדים כבר משובץ למשמרת הזו באותו יום.");
    }
    throw error;
  });
  return findSwap(swap.id);
}

// ---------------------------------------------------------------- giveaways

interface GiveawayRow {
  id: string;
  assignment_id: string;
  offered_by: string;
  offered_by_name: string;
  taken_by: string | null;
  taken_by_name: string | null;
  team_id: string;
  work_date: string;
  shift_name: string;
  starts_at: string;
  ends_at: string;
  status: GiveawayStatus;
  created_at: string | Date;
}

const GIVEAWAY_SELECT = `
  SELECT giveaways.*, offered.name AS offered_by_name, taken.name AS taken_by_name,
         assignments.work_date, assignments.starts_at, assignments.ends_at, templates.name AS shift_name
  FROM shift_giveaways giveaways
  JOIN shift_assignments assignments ON assignments.id = giveaways.assignment_id
  JOIN shift_templates templates ON templates.id = assignments.shift_template_id
  JOIN users offered ON offered.id = giveaways.offered_by
  LEFT JOIN users taken ON taken.id = giveaways.taken_by`;

function toGiveaway(row: GiveawayRow): Giveaway {
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    offeredBy: row.offered_by,
    offeredByName: row.offered_by_name,
    takenBy: row.taken_by,
    takenByName: row.taken_by_name,
    teamId: row.team_id,
    workDate: row.work_date,
    shiftName: row.shift_name,
    startsAt: normalizeTime(row.starts_at),
    endsAt: normalizeTime(row.ends_at),
    status: row.status,
    createdAt: new Date(row.created_at).toISOString()
  };
}

export async function findGiveaway(id: string) {
  const [row] = await query<GiveawayRow>(`${GIVEAWAY_SELECT} WHERE giveaways.id = $1`, [id]);
  return row ? toGiveaway(row) : null;
}

/** Open offers in the person's teams, their own giveaways, and those awaiting approval in approver teams. */
export async function listGiveaways(userId: string, boardTeamIds: string[], approverTeamIds: string[]) {
  const rows = await query<GiveawayRow>(
    `${GIVEAWAY_SELECT}
     WHERE ((giveaways.team_id = ANY($2::uuid[]) AND giveaways.status = 'OPEN' AND assignments.work_date >= CURRENT_DATE)
            OR giveaways.offered_by = $1 OR giveaways.taken_by = $1
            OR (giveaways.team_id = ANY($3::uuid[]) AND giveaways.status = 'PENDING_MANAGER'))
       AND giveaways.created_at > now() - interval '60 days'
     ORDER BY assignments.work_date, assignments.starts_at`,
    [userId, boardTeamIds, approverTeamIds]
  );
  return rows.map(toGiveaway);
}

export async function createGiveaway(assignmentId: string, offeredBy: string, teamId: string) {
  try {
    const [row] = await query<{ id: string }>(
      "INSERT INTO shift_giveaways (assignment_id, offered_by, team_id) VALUES ($1, $2, $3) RETURNING id",
      [assignmentId, offeredBy, teamId]
    );
    return findGiveaway(row.id);
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return null;
    }
    throw error;
  }
}

export async function takeGiveaway(id: string, takenBy: string) {
  const [row] = await query<{ id: string }>(
    `UPDATE shift_giveaways SET taken_by = $2, taken_at = now(), status = 'PENDING_MANAGER'
     WHERE id = $1 AND status = 'OPEN' RETURNING id`,
    [id, takenBy]
  );
  return row ? findGiveaway(row.id) : null;
}

export async function closeGiveaway(id: string, from: GiveawayStatus[], to: "CANCELLED" | "DECLINED_BY_MANAGER", decidedBy: string) {
  const [row] = await query<{ id: string }>(
    `UPDATE shift_giveaways SET status = $3, decided_at = now(), decided_by = $4
     WHERE id = $1 AND status = ANY($2::text[]) RETURNING id`,
    [id, from, to, decidedBy]
  );
  return row ? findGiveaway(row.id) : null;
}

export async function approveGiveaway(giveaway: Giveaway, decidedBy: string) {
  await inTransaction(async (client) => {
    const locked = await client.query(
      "SELECT taken_by FROM shift_giveaways WHERE id = $1 AND status = 'PENDING_MANAGER' FOR UPDATE",
      [giveaway.id]
    );
    if (locked.rowCount === 0 || !locked.rows[0].taken_by) {
      throw new RequestConflictError("הבקשה כבר טופלה.");
    }
    const moved = await client.query(
      "UPDATE shift_assignments SET user_id = $2 WHERE id = $1 AND user_id = $3",
      [giveaway.assignmentId, locked.rows[0].taken_by, giveaway.offeredBy]
    );
    if (moved.rowCount === 0) {
      throw new RequestConflictError("המשמרת השתנתה מאז שהוצעה למסירה.");
    }
    await client.query(
      "UPDATE shift_giveaways SET status = 'APPROVED', decided_at = now(), decided_by = $2 WHERE id = $1",
      [giveaway.id, decidedBy]
    );
  }).catch((error) => {
    if ((error as { code?: string }).code === "23505") {
      throw new RequestConflictError("העובד/ת כבר משובץ/ת למשמרת הזו באותו יום.");
    }
    throw error;
  });
  return findGiveaway(giveaway.id);
}

// ---------------------------------------------------------------- vacations

interface VacationRow {
  id: string;
  user_id: string;
  user_name: string;
  team_id: string | null;
  start_date: string;
  end_date: string;
  note: string;
  status: VacationStatus;
  removed_shift_count: number;
  created_at: string | Date;
}

const VACATION_SELECT = `
  SELECT vacations.*, users.name AS user_name, users.team_id
  FROM vacation_requests vacations
  JOIN users ON users.id = vacations.user_id`;

function toVacation(row: VacationRow): VacationRequest {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    teamId: row.team_id,
    startDate: row.start_date,
    endDate: row.end_date,
    note: row.note,
    status: row.status,
    removedShiftCount: row.removed_shift_count,
    createdAt: new Date(row.created_at).toISOString()
  };
}

export async function findVacation(id: string) {
  const [row] = await query<VacationRow>(`${VACATION_SELECT} WHERE vacations.id = $1`, [id]);
  return row ? toVacation(row) : null;
}

export async function listVacations(userId: string, approverTeamIds: string[]) {
  const rows = await query<VacationRow>(
    `${VACATION_SELECT}
     WHERE (vacations.user_id = $1 OR (users.team_id = ANY($2::uuid[]) AND vacations.status = 'PENDING'))
       AND vacations.end_date >= CURRENT_DATE - 60
     ORDER BY vacations.start_date`,
    [userId, approverTeamIds]
  );
  return rows.map(toVacation);
}

/** Approved vacations of the given teams overlapping [from, to). */
export async function listApprovedVacations(teamIds: string[], from: string, to: string) {
  const rows = await query<VacationRow>(
    `${VACATION_SELECT}
     WHERE users.team_id = ANY($1::uuid[]) AND vacations.status = 'APPROVED'
       AND vacations.start_date < $3 AND vacations.end_date >= $2`,
    [teamIds, from, to]
  );
  return rows.map(toVacation);
}

export async function createVacation(userId: string, startDate: string, endDate: string, note: string) {
  const [row] = await query<{ id: string }>(
    "INSERT INTO vacation_requests (user_id, start_date, end_date, note) VALUES ($1, $2, $3, $4) RETURNING id",
    [userId, startDate, endDate, note]
  );
  return findVacation(row.id);
}

export async function closeVacation(id: string, to: "CANCELLED" | "DECLINED", decidedBy: string) {
  const [row] = await query<{ id: string }>(
    `UPDATE vacation_requests SET status = $2, decided_at = now(), decided_by = $3
     WHERE id = $1 AND status = 'PENDING' RETURNING id`,
    [id, to, decidedBy]
  );
  return row ? findVacation(row.id) : null;
}

/** Marks every day as time off, removes the person's shifts on those days, and approves. */
export async function approveVacation(vacation: VacationRequest, decidedBy: string) {
  await inTransaction(async (client) => {
    const locked = await client.query(
      "SELECT id FROM vacation_requests WHERE id = $1 AND status = 'PENDING' FOR UPDATE",
      [vacation.id]
    );
    if (locked.rowCount === 0) {
      throw new RequestConflictError("הבקשה כבר טופלה.");
    }
    const days = diffDays(vacation.startDate, vacation.endDate) + 1;
    const dates = Array.from({ length: days }, (_, index) => addDays(vacation.startDate, index));
    await client.query(
      "DELETE FROM availability_entries WHERE user_id = $1 AND work_date = ANY($2::date[])",
      [vacation.userId, dates]
    );
    await client.query(
      `INSERT INTO availability_entries (user_id, work_date, shift_template_id, status, note)
       SELECT $1, day, NULL, 'TIME_OFF', 'חופשה מאושרת' FROM unnest($2::date[]) AS day`,
      [vacation.userId, dates]
    );
    // Giveaways and swaps of the removed shifts go with them (ON DELETE CASCADE / SET NULL).
    const removed = await client.query(
      "DELETE FROM shift_assignments WHERE user_id = $1 AND work_date BETWEEN $2 AND $3",
      [vacation.userId, vacation.startDate, vacation.endDate]
    );
    // Open swaps whose shift was just removed can no longer happen.
    await client.query(
      `UPDATE swap_requests SET status = 'CANCELLED'
       WHERE status IN ('PENDING_EMPLOYEE', 'PENDING_MANAGER')
         AND (requester_assignment_id IS NULL OR (target_shift_label IS NOT NULL AND target_assignment_id IS NULL))`
    );
    await client.query(
      `UPDATE vacation_requests SET status = 'APPROVED', decided_at = now(), decided_by = $2, removed_shift_count = $3
       WHERE id = $1`,
      [vacation.id, decidedBy, removed.rowCount ?? 0]
    );
  });
  return findVacation(vacation.id);
}
