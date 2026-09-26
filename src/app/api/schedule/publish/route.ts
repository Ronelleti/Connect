import { NextResponse } from "next/server";
import { isSundayDateOnly } from "@/lib/dates";
import { isApiError, jsonError, requireApiUser } from "@/server/api";
import { publishWeek } from "@/server/schedulePublishing";

// A manager marks a week's schedule as ready; every employee gets a notification (in the
// app and on their phone) listing their shifts for that week.
export async function POST(request: Request) {
  const user = await requireApiUser(["MANAGER"]);
  if (isApiError(user)) {
    return user;
  }

  const body = await request.json().catch(() => ({}));
  const weekStart = String(body.weekStart ?? "");
  if (!isSundayDateOnly(weekStart)) {
    return jsonError("A valid week (starting on Sunday) is required.");
  }

  return NextResponse.json(await publishWeek(weekStart, user.id));
}
