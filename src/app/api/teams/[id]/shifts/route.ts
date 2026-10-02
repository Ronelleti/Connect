import { NextResponse } from "next/server";
import { can } from "@/lib/permissions";
import { asActor } from "@/server/access";
import { forbidden, isApiError, jsonError, readJson, requireApiUser } from "@/server/api";
import { createShiftTemplate, findTeam, type ShiftTemplateInput } from "@/server/org";
import { parseShiftTemplateInput } from "@/server/validation";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  const team = await findTeam((await context.params).id);
  if (!team) {
    return jsonError("הצוות לא נמצא.", 404);
  }
  if (!can(asActor(user), "shifts.configure", team)) {
    return forbidden();
  }
  const { value, error } = parseShiftTemplateInput(await readJson(request), false);
  if (error) {
    return jsonError(error);
  }
  const shift = await createShiftTemplate(team.id, value as ShiftTemplateInput);
  return NextResponse.json({ shift }, { status: 201 });
}
