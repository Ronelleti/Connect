import { NextResponse } from "next/server";
import { can } from "@/lib/permissions";
import { asActor } from "@/server/access";
import { forbidden, isApiError, jsonError, readJson, requireApiUser } from "@/server/api";
import { moveErrors } from "@/server/moves";
import { findTeam } from "@/server/org";
import { findPerson } from "@/server/people";
import { notifySwapUpdated } from "@/server/requestNotifications";
import { applySwap, findSwap, RequestConflictError, setSwapStatus } from "@/server/requests";
import { findAssignment } from "@/server/schedule";

// accept / decline (the colleague), approve / reject (an approver), cancel (the requester).
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  const swap = await findSwap((await context.params).id);
  const team = swap ? await findTeam(swap.teamId) : null;
  if (!swap || !team) {
    return jsonError("הבקשה לא נמצאה.", 404);
  }
  const { action } = await readJson(request);
  let updated = null;

  if (action === "accept" || action === "decline") {
    if (swap.targetUserId !== user.id) {
      return forbidden();
    }
    updated = await setSwapStatus(swap.id, ["PENDING_EMPLOYEE"], action === "accept" ? "PENDING_MANAGER" : "DECLINED_BY_EMPLOYEE", null);
  } else if (action === "approve" || action === "reject") {
    const isParticipant = swap.requesterId === user.id || swap.targetUserId === user.id;
    if (!can(asActor(user), "requests.approve", team) || (isParticipant && user.role !== "ADMIN")) {
      return forbidden("אין לך הרשאה לאשר את הבקשה הזו.");
    }
    if (swap.status !== "PENDING_MANAGER") {
      return jsonError("הבקשה עדיין לא מוכנה לאישור או שכבר טופלה.", 409);
    }
    if (action === "reject") {
      updated = await setSwapStatus(swap.id, ["PENDING_MANAGER"], "DECLINED_BY_MANAGER", user.id);
    } else {
      const [mine, theirs, requester, target] = await Promise.all([
        swap.requesterAssignmentId ? findAssignment(swap.requesterAssignmentId) : null,
        swap.targetAssignmentId ? findAssignment(swap.targetAssignmentId) : null,
        findPerson(swap.requesterId),
        findPerson(swap.targetUserId)
      ]);
      if (!mine || !requester || !target || (swap.targetShiftLabel && !theirs)) {
        return jsonError("אחת המשמרות כבר לא קיימת.", 409);
      }
      const problems = [
        ...(await moveErrors(mine, target, theirs ? [theirs.id] : [])),
        ...(theirs ? await moveErrors(theirs, requester, [mine.id]) : [])
      ];
      if (problems.length > 0) {
        return jsonError(problems[0].message, 422, { errors: problems, warnings: [] });
      }
      try {
        updated = await applySwap(swap, user.id);
      } catch (error) {
        if (error instanceof RequestConflictError) {
          return jsonError(error.message, 409);
        }
        throw error;
      }
    }
  } else if (action === "cancel") {
    if (swap.requesterId !== user.id) {
      return forbidden();
    }
    updated = await setSwapStatus(swap.id, ["PENDING_EMPLOYEE", "PENDING_MANAGER"], "CANCELLED", user.id);
  } else {
    return jsonError("פעולה לא מוכרת.");
  }

  if (!updated) {
    return jsonError("הבקשה כבר טופלה.", 409);
  }
  await notifySwapUpdated(updated, team);
  return NextResponse.json({ swap: updated });
}
