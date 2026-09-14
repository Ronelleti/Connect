import { NextResponse } from "next/server";
import { generateWeeklySchedule } from "@/lib/autoSchedule";
import { isApiError, jsonError, requireApiUser } from "@/server/api";
import {
  bulkCreateAssignments,
  listAssignments,
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

  const [employees, existingAssignments, availabilityBlocks] = await Promise.all([
    listEmployees(),
    listAssignments(weekStart),
    listAvailabilityBlocks(weekStart)
  ]);

  const plan = generateWeeklySchedule(weekStart, employees, existingAssignments, availabilityBlocks);
  const created = await bulkCreateAssignments(weekStart, plan.created);

  return NextResponse.json({
    created,
    unfilled: plan.unfilled,
    relaxedRest: plan.relaxedRest
  });
}
