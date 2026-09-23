import { NextResponse } from "next/server";
import { getScheduleTimeParts } from "@/lib/dates";
import { getShiftStartInstant } from "@/lib/shifts";
import { isApiError, jsonError, requireApiUser } from "@/server/api";
import { findAssignment, listEmployees, listUpcomingAssignments } from "@/server/repositories";
import { notifyGiveawayOffered } from "@/server/requestNotifications";
import {
  createGiveaway,
  isUuid,
  listActiveGiveawayAssignmentIds,
  listGiveaways
} from "@/server/requests";

export async function GET() {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }

  const employees = await listEmployees();
  const employee = employees.find((item) => item.userId === user.id) ?? null;
  const now = new Date();
  const [giveaways, activeAssignmentIds, upcoming] = await Promise.all([
    listGiveaways(),
    listActiveGiveawayAssignmentIds(),
    employee
      ? listUpcomingAssignments(employee.id, getScheduleTimeParts(now).dateOnly, 40)
      : Promise.resolve([])
  ]);

  // Everyone sees the open board; finished giveaways only show to the people involved
  // (managers see all of them).
  const visible = giveaways.filter(
    (giveaway) =>
      giveaway.status === "OPEN" ||
      giveaway.status === "PENDING_MANAGER" ||
      user.role === "MANAGER" ||
      giveaway.offeredByEmployeeId === employee?.id ||
      giveaway.takenByEmployeeId === employee?.id
  );
  const offerableShifts = upcoming.filter(
    (assignment) =>
      !activeAssignmentIds.includes(assignment.id) &&
      getShiftStartInstant(assignment.weekStart, assignment.dayIndex, assignment.shiftType) > now
  );

  return NextResponse.json({
    employeeId: employee?.id ?? null,
    giveaways: visible,
    offerableShifts
  });
}

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }

  const body = await request.json().catch(() => ({}));
  const assignmentId = String(body.assignmentId ?? "");
  const assignment = isUuid(assignmentId) ? await findAssignment(assignmentId) : null;
  const employees = await listEmployees();
  const employee = employees.find((item) => item.userId === user.id);

  if (!assignment || !employee || assignment.employeeId !== employee.id) {
    return jsonError("אפשר למסור רק משמרת שלך.", 403);
  }
  if (getShiftStartInstant(assignment.weekStart, assignment.dayIndex, assignment.shiftType) <= new Date()) {
    return jsonError("אי אפשר למסור משמרת שכבר התחילה.");
  }

  const giveaway = await createGiveaway(assignment.id, employee.id);
  if (!giveaway) {
    return jsonError("המשמרת הזו כבר מוצעת למסירה.", 409);
  }
  await notifyGiveawayOffered(giveaway);
  return NextResponse.json({ giveaway }, { status: 201 });
}
