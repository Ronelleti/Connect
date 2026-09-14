import { NextResponse } from "next/server";
import { getRestWarnings } from "@/lib/shifts";
import { isApiError, jsonError, requireApiUser } from "@/server/api";
import {
  createSwapRequest,
  findAssignment,
  listAssignments,
  listEmployees
} from "@/server/repositories";
import { notifyManagerOfSwapRequest } from "@/server/swapNotifications";

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }

  const body = await request.json();
  const requesterAssignmentId = String(body.requesterAssignmentId ?? "");
  const targetEmployeeId = String(body.targetEmployeeId ?? "");
  const targetAssignmentId = body.targetAssignmentId ? String(body.targetAssignmentId) : null;

  if (!requesterAssignmentId || !targetEmployeeId) {
    return jsonError("Requester assignment and target employee are required.");
  }

  const [requesterAssignment, targetAssignment, employees] = await Promise.all([
    findAssignment(requesterAssignmentId),
    targetAssignmentId ? findAssignment(targetAssignmentId) : Promise.resolve(null),
    listEmployees()
  ]);
  const targetEmployee = employees.find((employee) => employee.id === targetEmployeeId);

  if (!requesterAssignment || !targetEmployee) {
    return jsonError("A valid requester assignment and target employee are required.", 404);
  }

  const requesterEmployee = employees.find(
    (employee) => employee.id === requesterAssignment.employeeId
  );
  if (user.role === "EMPLOYEE" && requesterEmployee?.userId !== user.id) {
    return jsonError("You can only request a swap for your own shift.", 403);
  }

  if (requesterAssignment.employeeId === targetEmployeeId) {
    return jsonError("Choose a different employee for the swap.");
  }

  if (
    targetAssignment &&
    (targetAssignment.employeeId !== targetEmployeeId ||
      targetAssignment.weekStart !== requesterAssignment.weekStart)
  ) {
    return jsonError("The target shift must belong to the selected employee in the same week.");
  }

  const assignments = await listAssignments(requesterAssignment.weekStart);
  const targetWarnings = getRestWarnings(
    {
      employeeId: targetEmployeeId,
      weekStart: requesterAssignment.weekStart,
      dayIndex: requesterAssignment.dayIndex,
      shiftType: requesterAssignment.shiftType
    },
    assignments.filter((assignment) => assignment.id !== targetAssignmentId)
  ).map((warning) => ({
    ...warning,
    code: `TARGET_${warning.code}`,
    message: `${targetEmployee.name}: ${warning.message}`
  }));

  const requesterWarnings = targetAssignment
    ? getRestWarnings(
        {
          employeeId: requesterAssignment.employeeId,
          weekStart: targetAssignment.weekStart,
          dayIndex: targetAssignment.dayIndex,
          shiftType: targetAssignment.shiftType
        },
        assignments.filter((assignment) => assignment.id !== requesterAssignment.id)
      ).map((warning) => ({
        ...warning,
        code: `REQUESTER_${warning.code}`,
        message: `${requesterEmployee?.name ?? "העובד המבקש"}: ${warning.message}`
      }))
    : [];
  const warnings = [...targetWarnings, ...requesterWarnings];

  if (warnings.length > 0 && body.acknowledgeWarnings !== true) {
    return jsonError("Swap requires rest warning confirmation.", 409, {
      errors: [],
      warnings
    });
  }

  const swap = await createSwapRequest({
    requesterAssignmentId,
    targetEmployeeId,
    targetAssignmentId
  });
  if (!swap) {
    return jsonError("כבר קיימת בקשת החלפה פעילה למשמרת הזו.", 409);
  }

  try {
    await notifyManagerOfSwapRequest(swap, new URL(request.url).origin);
  } catch (error) {
    console.error("Failed to send swap approval email", error);
  }

  return NextResponse.json({ swap, validation: { errors: [], warnings } }, { status: 201 });
}
