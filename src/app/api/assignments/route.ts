import { NextResponse } from "next/server";
import { validateAssignment } from "@/lib/shifts";
import type { ShiftType } from "@/lib/types";
import { isApiError, jsonError, requireApiUser } from "@/server/api";
import {
  listAssignmentsAroundWeek,
  listAvailabilityBlocks,
  listEmployees,
  replaceAssignment
} from "@/server/repositories";

export async function POST(request: Request) {
  const user = await requireApiUser(["MANAGER"]);
  if (isApiError(user)) {
    return user;
  }

  const body = await request.json();
  const employeeId = String(body.employeeId ?? "");
  const weekStart = String(body.weekStart ?? "");
  const dayIndex = Number(body.dayIndex);
  const shiftType = String(body.shiftType ?? "") as ShiftType;
  const replaceAssignmentId = body.replaceAssignmentId
    ? String(body.replaceAssignmentId)
    : null;
  const employees = await listEmployees();
  const employee = employees.find((item) => item.id === employeeId);

  if (
    !employee ||
    !weekStart ||
    !Number.isInteger(dayIndex) ||
    dayIndex < 0 ||
    dayIndex > 6 ||
    !["MORNING", "EVENING", "NIGHT"].includes(shiftType)
  ) {
    return jsonError("A valid employee, week, day, and shift are required.");
  }

  const [nearbyAssignments, availabilityBlocks] = await Promise.all([
    listAssignmentsAroundWeek(weekStart),
    listAvailabilityBlocks(weekStart)
  ]);
  const existingAssignments = nearbyAssignments.filter(
    (assignment) => assignment.weekStart === weekStart.slice(0, 10)
  );
  const occupiedAssignment = existingAssignments.find(
    (assignment) =>
      assignment.dayIndex === dayIndex && assignment.shiftType === shiftType
  );

  if ((occupiedAssignment?.id ?? null) !== replaceAssignmentId) {
    return jsonError("Shift is already occupied or was changed.", 409, {
      errors: [{
        code: "SHIFT_OCCUPIED",
        message: occupiedAssignment
          ? "המשמרת כבר מאוישת. יש לאשר החלפת עובד."
          : "השיבוץ השתנה בינתיים. יש לרענן ולנסות שוב."
      }],
      warnings: []
    });
  }

  const assignmentsForValidation = occupiedAssignment
    ? nearbyAssignments.filter((assignment) => assignment.id !== occupiedAssignment.id)
    : nearbyAssignments;
  const validation = validateAssignment(
    { employeeId, weekStart, dayIndex, shiftType },
    employee,
    assignmentsForValidation,
    availabilityBlocks
  );

  if (validation.errors.length > 0) {
    return jsonError("Assignment violates scheduling rules.", 409, validation);
  }

  if (validation.warnings.length > 0 && body.acknowledgeWarnings !== true) {
    return jsonError("Assignment requires warning confirmation.", 409, validation);
  }

  const assignment = await replaceAssignment(
    {
      employeeId,
      weekStart,
      dayIndex,
      shiftType,
      notes: String(body.notes ?? "")
    },
    replaceAssignmentId
  );

  if (!assignment) {
    return jsonError("Shift changed while it was being assigned.", 409, {
      errors: [{
        code: "SHIFT_CHANGED",
        message: "השיבוץ השתנה בינתיים. יש לרענן ולנסות שוב."
      }],
      warnings: []
    });
  }

  return NextResponse.json({ assignment, validation }, { status: 201 });
}
