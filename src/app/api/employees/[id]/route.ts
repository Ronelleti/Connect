import { NextResponse } from "next/server";
import { hashPassword } from "@/server/password";
import { isApiError, jsonError, requireApiUser } from "@/server/api";
import { handleEmployeeWriteError, parseEmployeeInput } from "@/server/employeeValidation";
import { deleteManagedEmployee, updateManagedEmployee } from "@/server/repositories";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(["MANAGER"]);
  if (isApiError(user)) {
    return user;
  }

  const body = await request.json();
  const input = parseEmployeeInput(body);
  const password = String(body.password ?? "");
  if (!input || (password.length > 0 && password.length < 12)) {
    return jsonError("יש להזין פרטי משתמש תקינים. סיסמה חדשה חייבת להכיל לפחות 12 תווים.");
  }

  try {
    const { id } = await context.params;
    const employee = await updateManagedEmployee({
      id,
      ...input,
      passwordHash: password ? await hashPassword(password) : null
    });
    return employee
      ? NextResponse.json({ employee })
      : jsonError("העובד לא נמצא.", 404);
  } catch (error) {
    return handleEmployeeWriteError(error);
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(["MANAGER"]);
  if (isApiError(user)) {
    return user;
  }

  const { id } = await context.params;
  return (await deleteManagedEmployee(id))
    ? NextResponse.json({ ok: true })
    : jsonError("העובד לא נמצא.", 404);
}
