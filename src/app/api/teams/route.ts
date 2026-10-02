import { NextResponse } from "next/server";
import { forbidden, isApiError, isUuid, jsonError, readJson, requireApiUser } from "@/server/api";
import { createTeam, listDepartments } from "@/server/org";
import { cleanName, parseColorSlot } from "@/server/validation";

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  const body = await readJson(request);
  const departmentId = body.departmentId;
  if (!isUuid(departmentId) || !(await listDepartments()).some((department) => department.id === departmentId)) {
    return jsonError("יש לבחור מחלקה.");
  }
  if (user.role !== "ADMIN" && !(user.role === "DEPARTMENT_MANAGER" && user.departmentId === departmentId)) {
    return forbidden();
  }
  const name = cleanName(body.name);
  if (!name) {
    return jsonError("יש לתת שם לצוות.");
  }
  const team = await createTeam({ departmentId, name, colorSlot: parseColorSlot(body.colorSlot) ?? undefined });
  return team ? NextResponse.json({ team }, { status: 201 }) : jsonError("כבר קיים צוות בשם הזה במחלקה.", 409);
}
