import { NextResponse } from "next/server";
import { forbidden, isApiError, jsonError, readJson, requireApiUser } from "@/server/api";
import { deleteDepartment, renameDepartment } from "@/server/org";
import { cleanName } from "@/server/validation";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  if (user.role !== "ADMIN") {
    return forbidden();
  }
  const { id } = await context.params;
  const name = cleanName((await readJson(request)).name);
  if (!name) {
    return jsonError("יש לתת שם למחלקה.");
  }
  const department = await renameDepartment(id, name);
  return department ? NextResponse.json({ department }) : jsonError("השם תפוס או שהמחלקה לא נמצאה.", 409);
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  if (user.role !== "ADMIN") {
    return forbidden();
  }
  const { id } = await context.params;
  return (await deleteDepartment(id))
    ? NextResponse.json({ ok: true })
    : jsonError("אפשר למחוק רק מחלקה ריקה (בלי צוותים ועובדים).", 409);
}
