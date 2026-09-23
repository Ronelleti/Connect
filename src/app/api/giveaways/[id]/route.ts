import { NextResponse } from "next/server";
import { findTimeOff } from "@/lib/availability";
import { getShiftStartInstant, validateAssignment } from "@/lib/shifts";
import type { Employee } from "@/lib/types";
import { isApiError, jsonError, requireApiUser } from "@/server/api";
import {
  listAssignmentsAroundWeek,
  listAvailabilityBlocks,
  listEmployees
} from "@/server/repositories";
import { notifyGiveawayDecided, notifyGiveawayTaken } from "@/server/requestNotifications";
import {
  approveGiveaway,
  cancelGiveaway,
  declineGiveaway,
  findGiveaway,
  isUuid,
  takeGiveaway,
  type ShiftGiveaway
} from "@/server/requests";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const action = String(body.action ?? "");
  const giveaway = isUuid(id) ? await findGiveaway(id) : null;
  if (!giveaway) {
    return jsonError("Giveaway not found.", 404);
  }

  const employees = await listEmployees();
  const employee = employees.find((item) => item.userId === user.id);

  if (action === "take") {
    if (!employee || employee.id === giveaway.offeredByEmployeeId) {
      return jsonError("אי אפשר לקחת את המשמרת הזו.", 403);
    }
    if (giveaway.status !== "OPEN") {
      return jsonError("המשמרת כבר נלקחה או שהמסירה בוטלה.", 409);
    }
    if (getShiftStartInstant(giveaway.weekStart, giveaway.dayIndex, giveaway.shiftType) <= new Date()) {
      return jsonError("המשמרת כבר התחילה.", 409);
    }
    const validation = await validateHandover(giveaway, employee);
    if (validation.errors.length > 0) {
      return jsonError("Taking this shift violates scheduling rules.", 409, validation);
    }
    if (validation.warnings.length > 0 && body.acknowledgeWarnings !== true) {
      return jsonError("Taking this shift requires warning confirmation.", 409, validation);
    }
    const taken = await takeGiveaway(id, employee.id);
    if (!taken) {
      return jsonError("המשמרת כבר נלקחה או שהמסירה בוטלה.", 409);
    }
    await notifyGiveawayTaken(taken);
    return NextResponse.json({ giveaway: taken });
  }

  if (action === "cancel") {
    if (!employee || employee.id !== giveaway.offeredByEmployeeId) {
      return jsonError("רק מי שמסר/ה את המשמרת יכול/ה לבטל.", 403);
    }
    const cancelled = await cancelGiveaway(id);
    if (!cancelled) {
      return jsonError("המסירה כבר טופלה.", 409);
    }
    await notifyGiveawayDecided(cancelled);
    return NextResponse.json({ giveaway: cancelled });
  }

  if (action === "approve" || action === "decline") {
    if (user.role !== "MANAGER") {
      return jsonError("Only a manager can approve a giveaway.", 403);
    }
    if (giveaway.status !== "PENDING_MANAGER") {
      return jsonError("המסירה כבר טופלה.", 409);
    }

    if (action === "approve") {
      const taker = employees.find((item) => item.id === giveaway.takenByEmployeeId);
      if (!taker) {
        return jsonError("העובד/ת שלקח/ה את המשמרת כבר לא קיים/ת.", 409);
      }
      // The schedule may have changed since the shift was taken: hard rules (rest,
      // weekly limit) are checked again; warnings are the manager's call.
      const validation = await validateHandover(giveaway, taker);
      if (validation.errors.length > 0) {
        return jsonError("Handover violates scheduling rules.", 409, validation);
      }
    }

    const decided = action === "approve" ? await approveGiveaway(id) : await declineGiveaway(id);
    if (!decided) {
      return jsonError("המסירה כבר טופלה או שהשיבוץ השתנה בינתיים.", 409);
    }
    await notifyGiveawayDecided(decided);
    return NextResponse.json({ giveaway: decided });
  }

  return jsonError("Unknown giveaway action.");
}

async function validateHandover(giveaway: ShiftGiveaway, taker: Employee) {
  const [nearbyAssignments, availabilityBlocks] = await Promise.all([
    listAssignmentsAroundWeek(giveaway.weekStart),
    listAvailabilityBlocks(giveaway.weekStart)
  ]);
  const validation = validateAssignment(
    {
      employeeId: taker.id,
      weekStart: giveaway.weekStart,
      dayIndex: giveaway.dayIndex,
      shiftType: giveaway.shiftType
    },
    taker,
    nearbyAssignments.filter((assignment) => assignment.id !== giveaway.assignmentId),
    availabilityBlocks
  );
  // Unlike a manager's manual assignment, an employee can't take a shift on a vacation day.
  if (findTimeOff(availabilityBlocks, taker.id, giveaway.dayIndex)) {
    validation.errors.push({ code: "ON_VACATION", message: "אי אפשר לקחת משמרת ביום חופשה." });
  }
  return validation;
}
