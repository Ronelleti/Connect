import { NextResponse } from "next/server";
import { diffDays, getScheduleTimeParts } from "@/lib/dates";
import { isApiError, jsonError, requireApiUser } from "@/server/api";
import { listEmployees } from "@/server/repositories";
import { notifyVacationRequested } from "@/server/requestNotifications";
import { createVacationRequest, listVacationRequests } from "@/server/requests";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_VACATION_DAYS = 60;
const MAX_NOTE_LENGTH = 300;

export async function GET() {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }

  const employees = await listEmployees();
  const employee = employees.find((item) => item.userId === user.id) ?? null;
  const [myRequests, allRequests] = await Promise.all([
    employee ? listVacationRequests(employee.id) : Promise.resolve([]),
    user.role === "MANAGER" ? listVacationRequests() : Promise.resolve([])
  ]);

  return NextResponse.json({
    isEmployee: Boolean(employee),
    myRequests,
    // Only managers get everyone's requests.
    managedRequests: allRequests
  });
}

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }

  const employees = await listEmployees();
  const employee = employees.find((item) => item.userId === user.id);
  if (!employee) {
    return jsonError("אין רשומת עובד המקושרת לחשבון זה.", 404);
  }

  const body = await request.json().catch(() => ({}));
  const startDate = String(body.startDate ?? "");
  const endDate = String(body.endDate ?? "");
  const note = String(body.note ?? "").trim().slice(0, MAX_NOTE_LENGTH);
  const { dateOnly: today } = getScheduleTimeParts(new Date());

  if (!DATE_PATTERN.test(startDate) || !DATE_PATTERN.test(endDate)) {
    return jsonError("יש לבחור תאריכי התחלה וסיום.");
  }
  if (startDate < today) {
    return jsonError("אי אפשר לבקש חופשה בתאריך שכבר עבר.");
  }
  if (endDate < startDate) {
    return jsonError("תאריך הסיום חייב להיות אחרי תאריך ההתחלה.");
  }
  if (diffDays(startDate, endDate) + 1 > MAX_VACATION_DAYS) {
    return jsonError(`אפשר לבקש עד ${MAX_VACATION_DAYS} ימים בבקשה אחת.`);
  }

  const vacation = await createVacationRequest({
    employeeId: employee.id,
    startDate,
    endDate,
    note
  });
  if (vacation) {
    await notifyVacationRequested(vacation);
  }
  return NextResponse.json({ request: vacation }, { status: 201 });
}
