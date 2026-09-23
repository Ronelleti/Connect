import { NextResponse } from "next/server";
import { generateWeeklySchedule } from "@/lib/autoSchedule";
import { isApiError, jsonError, requireApiUser } from "@/server/api";
import {
  bulkCreateAssignments,
  listAssignmentsAroundWeek,
  listAvailabilityBlocks,
  listEmployees
} from "@/server/repositories";

export async function POST(request: Request) {
  const user = await requireApiUser(["MANAGER"]);
  if (isApiError(user)) {
    return user;
  }

  const body = await request.json().catch(() => ({}));
  const weekStart = String(body.weekStart ?? "");
  if (!weekStart) {
    return jsonError("A week is required.");
  }

  const [employees, nearbyAssignments, availabilityBlocks] = await Promise.all([
    listEmployees(),
    listAssignmentsAroundWeek(weekStart),
    listAvailabilityBlocks(weekStart)
  ]);
  const existingAssignments = nearbyAssignments.filter(
    (assignment) => assignment.weekStart === weekStart.slice(0, 10)
  );
  const neighbouringAssignments = nearbyAssignments.filter(
    (assignment) => assignment.weekStart !== weekStart.slice(0, 10)
  );

  const plan = generateWeeklySchedule(
    weekStart,
    employees,
    existingAssignments,
    availabilityBlocks,
    neighbouringAssignments
  );
  const created = await bulkCreateAssignments(weekStart, plan.created);

  return NextResponse.json({
    created,
    unfilled: plan.unfilled,
    relaxedRest: plan.relaxedRest
  });
}
