import { NextResponse } from "next/server";
import { getScheduleTimeParts } from "@/lib/dates";
import { isApiError, isUuid, jsonError, readJson, requireApiUser } from "@/server/api";
import { listPeople } from "@/server/people";
import { notifyGiveawayOffered } from "@/server/requestNotifications";
import { createGiveaway } from "@/server/requests";
import { findAssignment } from "@/server/schedule";

// Offers one of my future shifts to my team.
export async function POST(request: Request) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  const { assignmentId } = await readJson(request);
  const assignment = isUuid(assignmentId) ? await findAssignment(assignmentId) : null;
  if (!assignment || assignment.userId !== user.id || assignment.workDate < getScheduleTimeParts().dateOnly) {
    return jsonError("אפשר למסור רק משמרת עתידית שלך.");
  }
  const giveaway = await createGiveaway(assignment.id, user.id, assignment.teamId);
  if (!giveaway) {
    return jsonError("המשמרת כבר מוצעת למסירה.", 409);
  }
  const members = await listPeople({ teamIds: [assignment.teamId] });
  await notifyGiveawayOffered(giveaway, members.map((member) => member.id));
  return NextResponse.json({ giveaway }, { status: 201 });
}
