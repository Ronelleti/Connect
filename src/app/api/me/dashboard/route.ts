import { NextResponse } from "next/server";
import { addDays, getScheduleMonthRange, getScheduleTimeParts, getSundayWeekStart } from "@/lib/dates";
import { getShiftStartInstant } from "@/lib/shifts";
import { isApiError, requireApiUser } from "@/server/api";
import { countEmployeeShiftsBetween, listEmployees, listUpcomingAssignments } from "@/server/repositories";

export async function GET() {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }

  const employees = await listEmployees();
  const employee = employees.find((item) => item.userId === user.id);

  if (!employee) {
    return NextResponse.json({
      employeeName: user.name,
      isEmployee: false,
      weekShiftCount: 0,
      weekHours: 0,
      monthShiftCount: 0,
      monthHours: 0,
      nextShift: null
    });
  }

  const now = new Date();
  const weekStart = getSundayWeekStart(now);
  const weekEnd = addDays(weekStart, 7);
  const { monthStart, monthEnd } = getScheduleMonthRange(now);
  const { dateOnly: today } = getScheduleTimeParts(now);

  const [weekShiftCount, monthShiftCount, upcoming] = await Promise.all([
    countEmployeeShiftsBetween(employee.id, weekStart, weekEnd),
    countEmployeeShiftsBetween(employee.id, monthStart, monthEnd),
    listUpcomingAssignments(employee.id, today, 10)
  ]);

  const nextAssignment = upcoming.find((assignment) => {
    const startsAt = getShiftStartInstant(assignment.weekStart, assignment.dayIndex, assignment.shiftType);
    return startsAt.getTime() > now.getTime();
  });

  return NextResponse.json({
    employeeName: employee.name,
    isEmployee: true,
    weekShiftCount,
    weekHours: weekShiftCount * 8,
    monthShiftCount,
    monthHours: monthShiftCount * 8,
    nextShift: nextAssignment
      ? {
          weekStart: nextAssignment.weekStart,
          dayIndex: nextAssignment.dayIndex,
          shiftType: nextAssignment.shiftType,
          startsAt: getShiftStartInstant(
            nextAssignment.weekStart,
            nextAssignment.dayIndex,
            nextAssignment.shiftType
          ).toISOString()
        }
      : null
  });
}
