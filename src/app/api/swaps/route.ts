import { NextResponse } from "next/server";
import { getScheduleTimeParts } from "@/lib/dates";
import { shiftLabel } from "@/lib/labels";
import { isApiError, isUuid, jsonError, readJson, requireApiUser } from "@/server/api";
import { findShiftTemplate } from "@/server/org";
import { findPerson } from "@/server/people";
import { notifySwapRequested } from "@/server/requestNotifications";
import { createSwap } from "@/server/requests";
import { findAssignment } from "@/server/schedule";

// Asks a teammate to take one of my shifts, optionally in exchange for one of theirs.
export async function POST(request: Request) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  const body = await readJson(request);
  if (!isUuid(body.requesterAssignmentId) || !isUuid(body.targetUserId)) {
    return jsonError("יש לבחור משמרת ועמית/ה.");
  }
  const today = getScheduleTimeParts().dateOnly;
  const mine = await findAssignment(body.requesterAssignmentId);
  if (!mine || mine.userId !== user.id || mine.workDate < today) {
    return jsonError("אפשר להציע להחלפה רק משמרת עתידית שלך.");
  }
  const target = await findPerson(body.targetUserId);
  if (!target || !target.isActive || target.id === user.id || target.teamId !== mine.teamId) {
    return jsonError("אפשר להחליף רק עם עמית/ה מאותו צוות.");
  }
  const theirs = isUuid(body.targetAssignmentId) ? await findAssignment(body.targetAssignmentId) : null;
  if (body.targetAssignmentId && (!theirs || theirs.userId !== target.id || theirs.teamId !== mine.teamId || theirs.workDate < today)) {
    return jsonError("המשמרת של העמית/ה לא תקינה.");
  }

  const [myTemplate, theirTemplate] = await Promise.all([
    findShiftTemplate(mine.shiftTemplateId),
    theirs ? findShiftTemplate(theirs.shiftTemplateId) : Promise.resolve(null)
  ]);
  const swap = await createSwap({
    requesterAssignmentId: mine.id,
    targetAssignmentId: theirs?.id ?? null,
    requesterId: user.id,
    targetUserId: target.id,
    teamId: mine.teamId,
    shiftLabel: shiftLabel(mine.workDate, myTemplate?.name ?? "משמרת", mine.startsAt, mine.endsAt),
    targetShiftLabel: theirs ? shiftLabel(theirs.workDate, theirTemplate?.name ?? "משמרת", theirs.startsAt, theirs.endsAt) : null
  });
  if (!swap) {
    return jsonError("כבר קיימת בקשה פעילה למשמרת הזו.", 409);
  }
  await notifySwapRequested(swap);
  return NextResponse.json({ swap }, { status: 201 });
}
