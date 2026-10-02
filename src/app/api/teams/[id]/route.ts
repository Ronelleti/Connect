import { NextResponse } from "next/server";
import { isInScope } from "@/lib/permissions";
import { asActor } from "@/server/access";
import { forbidden, isApiError, jsonError, readJson, requireApiUser } from "@/server/api";
import { deleteTeam, findTeam, updateTeam } from "@/server/org";
import { cleanName, parseColorSlot } from "@/server/validation";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  const team = await findTeam((await context.params).id);
  if (!team) {
    return jsonError("הצוות לא נמצא.", 404);
  }
  if (user.role !== "ADMIN" && !(user.role === "DEPARTMENT_MANAGER" && isInScope(asActor(user), team))) {
    return forbidden();
  }
  const body = await readJson(request);
  const name = body.name === undefined ? undefined : cleanName(body.name);
  if (name === null) {
    return jsonError("יש לתת שם לצוות.");
  }
  const colorSlot = body.colorSlot === undefined ? undefined : parseColorSlot(body.colorSlot);
  if (colorSlot === null) {
    return jsonError("צבע לא תקין.");
  }
  const updated = await updateTeam(team.id, { name, colorSlot });
  return updated ? NextResponse.json({ team: updated }) : jsonError("כבר קיים צוות בשם הזה במחלקה.", 409);
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  if (user.role !== "ADMIN") {
    return forbidden();
  }
  const team = await findTeam((await context.params).id);
  if (!team) {
    return jsonError("הצוות לא נמצא.", 404);
  }
  return (await deleteTeam(team.id))
    ? NextResponse.json({ ok: true })
    : jsonError("אפשר למחוק רק צוות בלי עובדים ובלי היסטוריית משמרות.", 409);
}
