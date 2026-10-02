import { NextResponse } from "next/server";
import { can } from "@/lib/permissions";
import { asActor } from "@/server/access";
import { forbidden, isApiError, jsonError, readJson, requireApiUser } from "@/server/api";
import { findShiftTemplate, findTeam, updateShiftTemplate } from "@/server/org";
import { parseShiftTemplateInput } from "@/server/validation";

// Edits a shift, or archives/restores it with { isActive }. Existing assignments keep the
// hours they were scheduled with.
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  const shift = await findShiftTemplate((await context.params).id);
  const team = shift ? await findTeam(shift.teamId) : null;
  if (!shift || !team) {
    return jsonError("המשמרת לא נמצאה.", 404);
  }
  if (!can(asActor(user), "shifts.configure", team)) {
    return forbidden();
  }
  const body = await readJson(request);
  const { value, error } = parseShiftTemplateInput(body, true);
  if (error) {
    return jsonError(error);
  }
  const startsAt = value.startsAt ?? shift.startsAt;
  const endsAt = value.endsAt ?? shift.endsAt;
  if (startsAt === endsAt) {
    return jsonError("שעת הסיום חייבת להיות שונה משעת ההתחלה.");
  }
  const isActive = typeof body.isActive === "boolean" ? body.isActive : undefined;
  const updated = await updateShiftTemplate(shift.id, { ...value, isActive });
  return NextResponse.json({ shift: updated });
}
