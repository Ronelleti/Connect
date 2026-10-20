import { NextResponse } from "next/server";
import { isApiError, jsonError, requireApiUser } from "@/server/api";
import { listEmployees } from "@/server/repositories";
import { notifyVacationDecided } from "@/server/requestNotifications";
import {
  approveVacationRequest,
  closeVacationRequest,
  findVacationRequest,
  isUuid
} from "@/server/requests";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const action = String(body.action ?? "");
  const vacation = isUuid(id) ? await findVacationRequest(id) : null;
  if (!vacation) {
    return jsonError("Vacation request not found.", 404);
  }

  if (action === "cancel") {
    const employees = await listEmployees();
    const employee = employees.find((item) => item.userId === user.id);
    if (!employee || employee.id !== vacation.employeeId) {
      return jsonError("אפשר לבטל רק בקשה שלך.", 403);
    }
    const cancelled = await closeVacationRequest(id, "CANCELLED");
    if (!cancelled) {
      return jsonError("הבקשה כבר טופלה.", 409);
    }
    return NextResponse.json({ request: cancelled });
  }

  if (action !== "approve" && action !== "decline") {
    return jsonError("Unknown vacation action.");
  }
  if (user.role !== "MANAGER") {
    return jsonError("Only a manager can decide on a vacation request.", 403);
  }

  if (action === "decline") {
    const declined = await closeVacationRequest(id, "DECLINED");
    if (!declined) {
      return jsonError("הבקשה כבר טופלה.", 409);
    }
    await notifyVacationDecided(declined);
    return NextResponse.json({ request: declined, removedShifts: [] });
  }

  const result = await approveVacationRequest(id);
  if (!result) {
    return jsonError("הבקשה כבר טופלה.", 409);
  }
  await notifyVacationDecided(result.request);
  return NextResponse.json({ request: result.request, removedShifts: result.removedShifts });
}
