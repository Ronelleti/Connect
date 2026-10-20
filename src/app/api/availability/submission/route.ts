import { NextResponse } from "next/server";
import { getAvailabilityWeekStart } from "@/lib/dates";
import { isApiError, jsonError, requireApiUser } from "@/server/api";
import { listEmployees } from "@/server/repositories";
import { findAvailabilitySubmission, markAvailabilitySubmitted } from "@/server/requests";

// Whether the signed-in employee has confirmed their availability for the week that is
// currently open for availability (two weeks ahead).
export async function GET() {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  const employee = (await listEmployees()).find((item) => item.userId === user.id);
  const weekStart = getAvailabilityWeekStart();
  if (!employee) {
    return NextResponse.json({ isEmployee: false, weekStart, submittedAt: null });
  }
  return NextResponse.json({
    isEmployee: true,
    weekStart,
    submittedAt: await findAvailabilitySubmission(employee.id, weekStart)
  });
}

export async function POST() {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  const employee = (await listEmployees()).find((item) => item.userId === user.id);
  if (!employee) {
    return jsonError("אין רשומת עובד המקושרת לחשבון זה.", 404);
  }
  const weekStart = getAvailabilityWeekStart();
  await markAvailabilitySubmitted(employee.id, weekStart);
  return NextResponse.json({
    weekStart,
    submittedAt: await findAvailabilitySubmission(employee.id, weekStart)
  });
}
