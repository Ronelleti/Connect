import { NextResponse } from "next/server";
import { addDays, getScheduleTimeParts } from "@/lib/dates";
import { DEFAULT_TAX_CREDIT_POINTS, estimateSalary, getPayPeriod } from "@/lib/salary";
import type { User } from "@/lib/types";
import { isApiError, jsonError, requireApiUser } from "@/server/api";
import {
  findPaySettings,
  listEmployeeAssignmentsBetween,
  listEmployees,
  savePaySettings
} from "@/server/repositories";

const MAX_PERIOD_OFFSET = 24;
const MAX_HOURLY_WAGE = 1000;
const MAX_TAX_CREDIT_POINTS = 20;

// Salary is personal: every request only ever reads or writes the signed-in user's own
// employee record, whatever their role.
async function findOwnEmployee(user: User) {
  const employees = await listEmployees();
  return employees.find((employee) => employee.userId === user.id) ?? null;
}

export async function GET(request: Request) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }

  const employee = await findOwnEmployee(user);
  if (!employee) {
    return NextResponse.json({ isEmployee: false });
  }

  const offset = Number(new URL(request.url).searchParams.get("offset") ?? 0);
  if (!Number.isInteger(offset) || Math.abs(offset) > MAX_PERIOD_OFFSET) {
    return jsonError("Invalid pay period.");
  }

  const { dateOnly: today } = getScheduleTimeParts(new Date());
  const period = getPayPeriod(today, offset);
  const [settings, assignments] = await Promise.all([
    findPaySettings(employee.id),
    listEmployeeAssignmentsBetween(employee.id, period.start, period.end)
  ]);
  const upcomingShiftCount = assignments.filter(
    (assignment) => addDays(assignment.weekStart, assignment.dayIndex) >= today
  ).length;

  return NextResponse.json({
    isEmployee: true,
    period: { ...period, lastDay: addDays(period.end, -1) },
    settings,
    shiftCount: assignments.length,
    upcomingShiftCount,
    estimate: settings
      ? estimateSalary(
          assignments.map((assignment) => assignment.shiftType),
          settings.hourlyWage,
          settings.taxCreditPoints
        )
      : null
  });
}

export async function PUT(request: Request) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }

  const employee = await findOwnEmployee(user);
  if (!employee) {
    return jsonError("No employee record is linked to this account.", 404);
  }

  const body = await request.json().catch(() => ({}));
  const hourlyWage = Number(body.hourlyWage);
  const taxCreditPoints = Number(body.taxCreditPoints ?? DEFAULT_TAX_CREDIT_POINTS);

  if (!Number.isFinite(hourlyWage) || hourlyWage <= 0 || hourlyWage > MAX_HOURLY_WAGE) {
    return jsonError("יש להזין שכר שעתי תקין.");
  }
  if (
    !Number.isFinite(taxCreditPoints) ||
    taxCreditPoints < 0 ||
    taxCreditPoints > MAX_TAX_CREDIT_POINTS
  ) {
    return jsonError("יש להזין מספר נקודות זיכוי תקין.");
  }

  await savePaySettings(employee.id, {
    hourlyWage: Math.round(hourlyWage * 100) / 100,
    taxCreditPoints: Math.round(taxCreditPoints * 100) / 100
  });
  return NextResponse.json({ ok: true });
}
