import { NextResponse } from "next/server";
import { getHandoverAvailabilityIssues } from "@/lib/availability";
import { getRestIssues } from "@/lib/shifts";
import type { AssignmentIssue } from "@/lib/types";
import { isApiError, jsonError, requireApiUser } from "@/server/api";
import {
  createSwapRequest,
  findAssignment,
  listAssignmentsAroundWeek,
  listAvailabilityBlocks,
  listEmployees
} from "@/server/repositories";
import { notifyManagerOfSwapRequest, notifySwapRequested } from "@/server/swapNotifications";

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

  const [assignments, availabilityBlocks] = await Promise.all([
    listAssignmentsAroundWeek(requesterAssignment.weekStart),
    listAvailabilityBlocks(requesterAssignment.weekStart)
  ]);
  const targetAvailability = getHandoverAvailabilityIssues(
    availabilityBlocks,
    targetEmployeeId,
    requesterAssignment.dayIndex,
    requesterAssignment.shiftType
  );
  const requesterAvailability = targetAssignment
    ? getHandoverAvailabilityIssues(
        availabilityBlocks,
        requesterAssignment.employeeId,
        targetAssignment.dayIndex,
        targetAssignment.shiftType
      )
    : { errors: [], warnings: [] };
  const targetRest = getRestIssues(
    {
      employeeId: targetEmployeeId,
      weekStart: requesterAssignment.weekStart,
      dayIndex: requesterAssignment.dayIndex,
      shiftType: requesterAssignment.shiftType
    },
    assignments.filter((assignment) => assignment.id !== targetAssignmentId)
  );
  const requesterRest = targetAssignment
    ? getRestIssues(
        {
          employeeId: requesterAssignment.employeeId,
          weekStart: targetAssignment.weekStart,
          dayIndex: targetAssignment.dayIndex,
          shiftType: targetAssignment.shiftType
        },
        assignments.filter((assignment) => assignment.id !== requesterAssignment.id)
      )
    : { errors: [], warnings: [] };
  const labelTarget = (issue: AssignmentIssue) => ({
    ...issue,
    code: `TARGET_${issue.code}`,
    message: `${targetEmployee.name}: ${issue.message}`
  });
  const labelRequester = (issue: AssignmentIssue) => ({
    ...issue,
    code: `REQUESTER_${issue.code}`,
    message: `${requesterEmployee?.name ?? "העובד המבקש"}: ${issue.message}`
  });
  const errors = [
    ...targetAvailability.errors.map(labelTarget),
    ...targetRest.errors.map(labelTarget),
    ...requesterAvailability.errors.map(labelRequester),
    ...requesterRest.errors.map(labelRequester)
  ];
  const warnings = [
    ...targetAvailability.warnings.map(labelTarget),
    ...targetRest.warnings.map(labelTarget),
    ...requesterAvailability.warnings.map(labelRequester),
    ...requesterRest.warnings.map(labelRequester)
  ];

  if (errors.length > 0) {
    return jsonError("Swap violates scheduling rules.", 409, { errors, warnings });
  }

  if (warnings.length > 0 && body.acknowledgeWarnings !== true) {
    return jsonError("Swap requires warning confirmation.", 409, {
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
  await notifySwapRequested(swap);

  return NextResponse.json({ swap, validation: { errors: [], warnings } }, { status: 201 });
}
