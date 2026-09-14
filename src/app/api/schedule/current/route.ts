import { NextResponse } from "next/server";
import { getCurrentShiftSlot } from "@/lib/shifts";
import { isApiError, requireApiUser } from "@/server/api";
import { listAssignments, listEmployees } from "@/server/repositories";

export async function GET() {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }

  const slot = getCurrentShiftSlot();
  const [assignments, employees] = await Promise.all([
    listAssignments(slot.weekStart),
    listEmployees()
  ]);
  const employeesById = new Map(employees.map((employee) => [employee.id, employee]));
  const onShift = assignments
    .filter(
      (assignment) => assignment.dayIndex === slot.dayIndex && assignment.shiftType === slot.shiftType
    )
    .map((assignment) => employeesById.get(assignment.employeeId))
    .filter((employee): employee is NonNullable<typeof employee> => Boolean(employee))
    .map((employee) => ({ id: employee.id, name: employee.name, userId: employee.userId }));

  return NextResponse.json({
    weekStart: slot.weekStart,
    dayIndex: slot.dayIndex,
    shiftType: slot.shiftType,
    employees: onShift
  });
}
