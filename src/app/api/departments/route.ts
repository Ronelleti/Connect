import { NextResponse } from "next/server";
import { forbidden, isApiError, jsonError, readJson, requireApiUser } from "@/server/api";
import { createDepartment } from "@/server/org";
import { cleanName } from "@/server/validation";

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  if (user.role !== "ADMIN") {
    return forbidden();
  }
  const name = cleanName((await readJson(request)).name);
  if (!name) {
    return jsonError("יש לתת שם למחלקה.");
  }
  const department = await createDepartment(name);
  return department ? NextResponse.json({ department }, { status: 201 }) : jsonError("כבר קיימת מחלקה בשם הזה.", 409);
}
