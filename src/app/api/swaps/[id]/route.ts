import { NextResponse } from "next/server";
import { isApiError, jsonError, requireApiUser } from "@/server/api";
import {
  decideSwapRequest,
  findSwapRequest,
  listEmployees,
  type SwapDecisionAction
} from "@/server/repositories";

const ACTIONS: Record<string, {
  action: SwapDecisionAction;
  actor: "EMPLOYEE" | "MANAGER";
}> = {
  approve_employee: {
    action: "approve_employee",
    actor: "EMPLOYEE"
  },
  decline_employee: {
    action: "decline_employee",
    actor: "EMPLOYEE"
  },
  approve_manager: {
    action: "approve_manager",
    actor: "MANAGER"
  },
  decline_manager: {
    action: "decline_manager",
    actor: "MANAGER"
  }
};

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const body = await request.json();
  const action = ACTIONS[String(body.action ?? "")];

  if (!action) {
    return jsonError("Unknown swap action.");
  }

  const user = await requireApiUser(action.actor === "MANAGER" ? ["MANAGER"] : undefined);
  if (isApiError(user)) {
    return user;
  }

  const { id } = await context.params;
  const swapRequest = await findSwapRequest(id);
  if (!swapRequest) {
    return jsonError("Swap request not found.", 404);
  }

  if (action.actor === "EMPLOYEE") {
    const employees = await listEmployees();
    const targetEmployee = employees.find(
      (employee) => employee.id === swapRequest.targetEmployeeId
    );
    if (targetEmployee?.userId !== user.id) {
      return jsonError("Only the target employee can respond to this swap.", 403);
    }
  }

  const swap = await decideSwapRequest(id, action.action);
  if (!swap) {
    return jsonError("This swap request was already handled or the schedule has changed.", 409);
  }
  return NextResponse.json({ swap });
}
