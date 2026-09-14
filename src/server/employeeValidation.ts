import { jsonError } from "./api";

export function parseEmployeeInput(body: Record<string, unknown>) {
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const roleTitle = String(body.roleTitle ?? "עובד/ת משמרת").trim();
  const weeklyMinShifts = Number(body.weeklyMinShifts);
  const weeklyMaxShifts = Number(body.weeklyMaxShifts);
  if (
    !name ||
    !email.includes("@") ||
    !roleTitle ||
    !Number.isInteger(weeklyMinShifts) ||
    !Number.isInteger(weeklyMaxShifts) ||
    weeklyMinShifts < 1 ||
    weeklyMinShifts > 6 ||
    weeklyMaxShifts < 1 ||
    weeklyMaxShifts > 6 ||
    weeklyMinShifts > weeklyMaxShifts
  ) {
    return null;
  }
  return { name, email, roleTitle, weeklyMinShifts, weeklyMaxShifts };
}

export function handleEmployeeWriteError(error: unknown) {
  if (isPostgresError(error) && error.code === "23505") {
    return jsonError("כבר קיים משתמש עם כתובת האימייל הזו.", 409);
  }
  return jsonError("לא ניתן לשמור את המשתמש.", 500);
}

function isPostgresError(error: unknown): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error;
}
