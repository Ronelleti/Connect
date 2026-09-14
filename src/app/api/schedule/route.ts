import { NextResponse } from "next/server";
import { getAvailabilityWeekStart, getSundayWeekStart } from "@/lib/dates";
import { calculateSummaries } from "@/lib/shifts";
import { isApiError, requireApiUser } from "@/server/api";
import {
  listAssignments,
  listAvailabilityBlocks,
  listEmployees,
  listSwapRequests
} from "@/server/repositories";

export async function GET(request: Request) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }

  const { searchParams } = new URL(request.url);
  const weekStart = searchParams.get("weekStart") ?? getSundayWeekStart();
  const availabilityWeekStart =
    searchParams.get("availabilityWeekStart") ?? getAvailabilityWeekStart();
  const [employees, assignments, scheduleAvailabilityBlocks, availabilityBlocks, swaps] =
    await Promise.all([
      listEmployees(),
      listAssignments(weekStart),
      listAvailabilityBlocks(weekStart),
      listAvailabilityBlocks(availabilityWeekStart),
      listSwapRequests()
    ]);
  const ownEmployeeIds = new Set(
    employees.filter((employee) => employee.userId === user.id).map((employee) => employee.id)
  );
  const visibleSwaps = user.role === "MANAGER"
    ? swaps
    : swaps.filter(
        (swap) =>
          (swap.requesterEmployeeId && ownEmployeeIds.has(swap.requesterEmployeeId)) ||
          ownEmployeeIds.has(swap.targetEmployeeId)
      );
  const visibleEmployees = user.role === "MANAGER"
    ? employees
    : employees.map((employee) =>
        employee.userId === user.id
          ? employee
          : { ...employee, userId: null, email: "" }
      );

  return NextResponse.json({
    weekStart,
    availabilityWeekStart,
    employees: visibleEmployees,
    assignments,
    scheduleAvailabilityBlocks,
    availabilityBlocks,
    swaps: visibleSwaps,
    summaries: calculateSummaries(employees, assignments)
  });
}
