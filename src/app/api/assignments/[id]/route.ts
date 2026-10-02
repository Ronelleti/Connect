import { NextResponse } from "next/server";
import { can } from "@/lib/permissions";
import { asActor } from "@/server/access";
import { forbidden, isApiError, jsonError, requireApiUser } from "@/server/api";
import { findTeam } from "@/server/org";
import { deleteAssignment, findAssignment } from "@/server/schedule";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  const assignment = await findAssignment((await context.params).id);
  const team = assignment ? await findTeam(assignment.teamId) : null;
  if (!assignment || !team) {
    return jsonError("השיבוץ לא נמצא.", 404);
  }
  if (!can(asActor(user), "schedule.edit", team)) {
    return forbidden();
  }
  await deleteAssignment(assignment.id);
  return NextResponse.json({ ok: true });
}
