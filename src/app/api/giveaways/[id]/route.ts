import { NextResponse } from "next/server";
import { can } from "@/lib/permissions";
import { asActor } from "@/server/access";
import { forbidden, isApiError, jsonError, readJson, requireApiUser } from "@/server/api";
import { moveErrors } from "@/server/moves";
import { findTeam } from "@/server/org";
import { findPerson } from "@/server/people";
import { notifyGiveawayUpdated } from "@/server/requestNotifications";
import { approveGiveaway, closeGiveaway, findGiveaway, RequestConflictError, takeGiveaway } from "@/server/requests";
import { findAssignment } from "@/server/schedule";

// take (a teammate), cancel (the person offering), approve / decline (an approver).
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  const giveaway = await findGiveaway((await context.params).id);
  const team = giveaway ? await findTeam(giveaway.teamId) : null;
  if (!giveaway || !team) {
    return jsonError("המסירה לא נמצאה.", 404);
  }
  const { action } = await readJson(request);
  let updated = null;

  if (action === "take") {
    if (user.teamId !== team.id || giveaway.offeredBy === user.id) {
      return forbidden("אפשר לקחת רק משמרת של עמית/ה מהצוות שלך.");
    }
    const [assignment, me] = await Promise.all([findAssignment(giveaway.assignmentId), findPerson(user.id)]);
    if (!assignment || !me) {
      return jsonError("המשמרת כבר לא קיימת.", 409);
    }
    const problems = await moveErrors(assignment, me);
    if (problems.length > 0) {
      return jsonError(problems[0].message, 422, { errors: problems, warnings: [] });
    }
    updated = await takeGiveaway(giveaway.id, user.id);
  } else if (action === "cancel") {
    if (giveaway.offeredBy !== user.id) {
      return forbidden();
    }
    updated = await closeGiveaway(giveaway.id, ["OPEN", "PENDING_MANAGER"], "CANCELLED", user.id);
  } else if (action === "approve" || action === "decline") {
    const isParticipant = giveaway.offeredBy === user.id || giveaway.takenBy === user.id;
    if (!can(asActor(user), "requests.approve", team) || (isParticipant && user.role !== "ADMIN")) {
      return forbidden("אין לך הרשאה לאשר את הבקשה הזו.");
    }
    if (action === "decline") {
      updated = await closeGiveaway(giveaway.id, ["PENDING_MANAGER"], "DECLINED_BY_MANAGER", user.id);
    } else {
      const [assignment, taker] = await Promise.all([
        findAssignment(giveaway.assignmentId),
        giveaway.takenBy ? findPerson(giveaway.takenBy) : null
      ]);
      if (!assignment || !taker || giveaway.status !== "PENDING_MANAGER") {
        return jsonError("הבקשה עדיין לא מוכנה לאישור או שכבר טופלה.", 409);
      }
      const problems = await moveErrors(assignment, taker);
      if (problems.length > 0) {
        return jsonError(problems[0].message, 422, { errors: problems, warnings: [] });
      }
      try {
        updated = await approveGiveaway(giveaway, user.id);
      } catch (error) {
        if (error instanceof RequestConflictError) {
          return jsonError(error.message, 409);
        }
        throw error;
      }
    }
  } else {
    return jsonError("פעולה לא מוכרת.");
  }

  if (!updated) {
    return jsonError("המסירה כבר טופלה.", 409);
  }
  await notifyGiveawayUpdated(updated, team);
  return NextResponse.json({ giveaway: updated });
}
