import { NextResponse } from "next/server";
import { assignableRoles, canEditPermissions, canManagePerson, seesEverything, teamsWithPermission, visibleTeams } from "@/lib/permissions";
import { asActor, loadOrg } from "@/server/access";
import { forbidden, isApiError, jsonError, readJson, requireApiUser } from "@/server/api";
import { hashPassword } from "@/server/password";
import { createPerson, listPeople, setExtraPermissions } from "@/server/people";
import { parsePersonBody, resolvePlacement } from "@/server/peopleInput";

// People in the teams the signed-in person can see. Contact details and limits are only
// included for people they can manage.
export async function GET(request: Request) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  const actor = asActor(user);
  const { teams } = await loadOrg();
  const includeInactive = new URL(request.url).searchParams.get("inactive") === "1";
  const visibleTeamIds = visibleTeams(actor, teams).map((team) => team.id);
  const managedDepartmentIds =
    user.role === "DEPARTMENT_MANAGER" && user.departmentId ? [user.departmentId] : [];

  const people =
    seesEverything(user.role)
      ? await listPeople({ includeInactive })
      : await listPeople({ teamIds: visibleTeamIds, departmentIds: managedDepartmentIds, includeInactive });

  return NextResponse.json({
    people: people.map((person) =>
      canManagePerson(actor, person, teams) || person.id === user.id
        ? { ...person, canManage: canManagePerson(actor, person, teams) }
        : {
            ...person,
            email: "",
            weeklyMinHours: 0,
            weeklyMaxHours: 0,
            extraPermissions: [],
            canManage: false
          }
    ),
    assignableRoles: assignableRoles(actor),
    manageableTeamIds: user.role === "ADMIN" ? teams.map((team) => team.id) : teamsWithPermission(actor, "people.manage", teams).map((team) => team.id),
    canEditPermissions: canEditPermissions(actor)
  });
}

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  const actor = asActor(user);
  const { departments, teams } = await loadOrg();
  const { value, error } = parsePersonBody(await readJson(request));
  if (error) {
    return jsonError(error);
  }
  if (!value.email || !value.name || !value.role || !value.password) {
    return jsonError("יש למלא שם, אימייל, תפקיד וסיסמה ראשונית.");
  }
  const placement = resolvePlacement(value.role, value.departmentId ?? null, value.teamId ?? null, departments, teams);
  if (placement.error) {
    return jsonError(placement.error);
  }
  const candidate = { id: "new", role: value.role, departmentId: placement.departmentId, teamId: placement.teamId };
  if (!canManagePerson(actor, candidate, teams)) {
    return forbidden("אין לך הרשאה להוסיף עובד/ת בתפקיד או בצוות הזה.");
  }
  if (value.extraPermissions && value.extraPermissions.length > 0 && !canEditPermissions(actor)) {
    return forbidden("רק מנהל מערכת יכול להוסיף הרשאות אישיות.");
  }
  const weeklyMinHours = value.weeklyMinHours ?? 0;
  const weeklyMaxHours = value.weeklyMaxHours ?? 45;
  if (weeklyMaxHours < 1 || weeklyMinHours > weeklyMaxHours) {
    return jsonError("מינימום השעות לא יכול לעלות על המקסימום.");
  }

  const person = await createPerson({
    email: value.email,
    name: value.name,
    role: value.role,
    departmentId: placement.departmentId,
    teamId: placement.teamId,
    title: value.title ?? "",
    weeklyMinHours,
    weeklyMaxHours,
    passwordHash: await hashPassword(value.password)
  });
  if (!person) {
    return jsonError("כבר קיים משתמש עם האימייל הזה.", 409);
  }
  if (value.extraPermissions?.length) {
    await setExtraPermissions(person.id, value.extraPermissions);
  }
  return NextResponse.json({ person: { ...person, extraPermissions: value.extraPermissions ?? [] } }, { status: 201 });
}
