import { NextResponse } from "next/server";
import { can } from "@/lib/permissions";
import { asActor } from "@/server/access";
import { forbidden, isApiError, jsonError, readJson, requireApiUser } from "@/server/api";
import { findTeam } from "@/server/org";
import { notifyVacationDecided } from "@/server/requestNotifications";
import { approveVacation, closeVacation, findVacation, RequestConflictError } from "@/server/requests";

// approve / decline (an approver for the person's team), cancel (the person).
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  const vacation = await findVacation((await context.params).id);
  if (!vacation) {
    return jsonError("הבקשה לא נמצאה.", 404);
  }
  const { action } = await readJson(request);

  if (action === "cancel") {
    if (vacation.userId !== user.id) {
      return forbidden();
    }
    const updated = await closeVacation(vacation.id, "CANCELLED", user.id);
    return updated ? NextResponse.json({ vacation: updated }) : jsonError("הבקשה כבר טופלה.", 409);
  }
  if (action !== "approve" && action !== "decline") {
    return jsonError("פעולה לא מוכרת.");
  }
  const team = vacation.teamId ? await findTeam(vacation.teamId) : null;
  const allowed = user.role === "ADMIN" || (team !== null && can(asActor(user), "requests.approve", team) && vacation.userId !== user.id);
  if (!allowed) {
    return forbidden("אין לך הרשאה לאשר את הבקשה הזו.");
  }

  let updated;
  try {
    updated = action === "approve" ? await approveVacation(vacation, user.id) : await closeVacation(vacation.id, "DECLINED", user.id);
  } catch (error) {
    if (error instanceof RequestConflictError) {
      return jsonError(error.message, 409);
    }
    throw error;
  }
  if (!updated) {
    return jsonError("הבקשה כבר טופלה.", 409);
  }
  await notifyVacationDecided(updated);
  return NextResponse.json({ vacation: updated });
}
