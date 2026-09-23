import { NextResponse } from "next/server";
import type { AvailabilityStatus, ShiftType } from "@/lib/types";
import { isApiError, jsonError, requireApiUser } from "@/server/api";
import { createAvailabilityBlock, listEmployees } from "@/server/repositories";
import { markAvailabilitySubmitted } from "@/server/requests";

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }

  const body = await request.json();
  const employeeId = String(body.employeeId ?? "");
  const weekStart = String(body.weekStart ?? "");
  const dayIndex = Number(body.dayIndex);
  const shiftType = body.shiftType ? (String(body.shiftType) as ShiftType) : null;
  const startsAt = body.startsAt ? String(body.startsAt) : null;
  const endsAt = body.endsAt ? String(body.endsAt) : null;
  const status = String(body.status ?? "UNAVAILABLE") as AvailabilityStatus;
  const employee = (await listEmployees()).find((item) => item.id === employeeId);

  if (
    !employee ||
    !weekStart ||
    !Number.isInteger(dayIndex) ||
    dayIndex < 0 ||
    dayIndex > 6 ||
    !["UNAVAILABLE", "PREFERRED", "TIME_OFF"].includes(status) ||
    (status !== "TIME_OFF" && !shiftType && (!startsAt || !endsAt))
  ) {
    return jsonError("A valid employee, week, day, and blocked shift or time range are required.");
  }

  if (user.role === "EMPLOYEE" && employee.userId !== user.id) {
    return jsonError("Employees can only update their own availability.", 403);
  }

  const block = await createAvailabilityBlock({
    employeeId,
    weekStart,
    dayIndex,
    shiftType,
    startsAt,
    endsAt,
    reason: String(body.reason ?? ""),
    status
  });

  if (employee.userId === user.id) {
    await markAvailabilitySubmitted(employee.id, block.weekStart);
  }

  return NextResponse.json({ block }, { status: 201 });
}
