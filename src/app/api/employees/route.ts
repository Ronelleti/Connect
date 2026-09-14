import { NextResponse } from "next/server";
import { hashPassword } from "@/server/password";
import { isApiError, jsonError, requireApiUser } from "@/server/api";
import { handleEmployeeWriteError, parseEmployeeInput } from "@/server/employeeValidation";
import { createManagedEmployee } from "@/server/repositories";

export async function POST(request: Request) {
  const user = await requireApiUser(["MANAGER"]);
  if (isApiError(user)) {
    return user;
  }

  const body = await request.json();
  const input = parseEmployeeInput(body);
  const password = String(body.password ?? "");
  if (!input || password.length < 12) {
    return jsonError("יש למלא שם, אימייל, תפקיד, מגבלות משמרות וסיסמה באורך 12 תווים לפחות.");
  }

  try {
    const employee = await createManagedEmployee({
      ...input,
      passwordHash: await hashPassword(password)
    });
    return NextResponse.json({ employee }, { status: 201 });
  } catch (error) {
    return handleEmployeeWriteError(error);
  }
}
