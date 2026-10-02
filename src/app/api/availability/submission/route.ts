import { NextResponse } from "next/server";
import { isSundayDateOnly } from "@/lib/dates";
import { isApiError, jsonError, readJson, requireApiUser } from "@/server/api";
import { markAvailabilitySubmitted } from "@/server/schedule";

// "I'm done": marks the week as filled in even if nothing needed changing.
export async function POST(request: Request) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  const { weekStart } = await readJson(request);
  if (typeof weekStart !== "string" || !isSundayDateOnly(weekStart)) {
    return jsonError("שבוע לא תקין.");
  }
  await markAvailabilitySubmitted(user.id, weekStart);
  return NextResponse.json({ ok: true });
}
