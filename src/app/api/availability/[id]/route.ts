import { NextResponse } from "next/server";
import { isApiError, jsonError, requireApiUser } from "@/server/api";
import {
  deleteAvailabilityBlock,
  findAvailabilityBlock,
  listEmployees
} from "@/server/repositories";

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }

  const { id } = await context.params;
  const block = await findAvailabilityBlock(id);
  if (!block) {
    return jsonError("Availability block was not found.", 404);
  }

  const employee = (await listEmployees()).find((item) => item.id === block.employeeId);
  if (user.role === "EMPLOYEE" && employee?.userId !== user.id) {
    return jsonError("Employees can only update their own availability.", 403);
  }

  await deleteAvailabilityBlock(block.id);
  return NextResponse.json({ ok: true });
}
