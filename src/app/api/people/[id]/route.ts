import { NextResponse } from "next/server";
import { canEditPermissions, canManagePerson } from "@/lib/permissions";
import { asActor, loadOrg } from "@/server/access";
import { forbidden, isApiError, jsonError, readJson, requireApiUser } from "@/server/api";
import { query } from "@/server/db";
import { hashPassword } from "@/server/password";
import { findPerson, setExtraPermissions, updatePerson } from "@/server/people";
import { parsePersonBody, resolvePlacement } from "@/server/peopleInput";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  const actor = asActor(user);
  const { departments, teams } = await loadOrg();
  const existing = await findPerson((await context.params).id);
  if (!existing) {
    return jsonError("העובד/ת לא נמצא/ה.", 404);
  }
  if (!canManagePerson(actor, existing, teams)) {
    return forbidden();
  }
  const { value, error } = parsePersonBody(await readJson(request));
  if (error) {
    return jsonError(error);
  }
  if (value.extraPermissions && !canEditPermissions(actor)) {
    return forbidden("רק מנהל מערכת יכול לשנות הרשאות אישיות.");
  }

  const role = value.role ?? existing.role;
  const placement = resolvePlacement(
    role,
    value.departmentId !== undefined ? value.departmentId : existing.departmentId,
    value.teamId !== undefined ? value.teamId : existing.teamId,
    departments,
    teams
  );
  if (placement.error) {
    return jsonError(placement.error);
  }
  if (!canManagePerson(actor, { id: existing.id, role, departmentId: placement.departmentId, teamId: placement.teamId }, teams)) {
    return forbidden("אין לך הרשאה להעביר את העובד/ת לתפקיד או לצוות הזה.");
  }
  const weeklyMinHours = value.weeklyMinHours ?? existing.weeklyMinHours;
  const weeklyMaxHours = value.weeklyMaxHours ?? existing.weeklyMaxHours;
  if (weeklyMaxHours < 1 || weeklyMinHours > weeklyMaxHours) {
    return jsonError("מינימום השעות לא יכול לעלות על המקסימום.");
  }

  // Never leave the system without an active admin.
  const losesAdmin = existing.role === "ADMIN" && (role !== "ADMIN" || value.isActive === false);
  if (losesAdmin) {
    const [row] = await query<{ count: number }>(
      "SELECT count(*)::int AS count FROM users WHERE role = 'ADMIN' AND is_active AND id <> $1",
      [existing.id]
    );
    if ((row?.count ?? 0) === 0) {
      return jsonError("זהו מנהל המערכת הפעיל היחיד. יש למנות מנהל מערכת נוסף קודם.", 409);
    }
  }

  const updated = await updatePerson(existing.id, {
    email: value.email,
    name: value.name,
    role,
    departmentId: placement.departmentId,
    teamId: placement.teamId,
    title: value.title,
    weeklyMinHours,
    weeklyMaxHours,
    isActive: value.isActive,
    passwordHash: value.password ? await hashPassword(value.password) : undefined
  });
  if (!updated) {
    return jsonError("כבר קיים משתמש עם האימייל הזה.", 409);
  }
  if (value.extraPermissions) {
    await setExtraPermissions(existing.id, value.extraPermissions);
  }
  return NextResponse.json({ person: await findPerson(existing.id) });
}
