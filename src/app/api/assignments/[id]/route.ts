import { NextResponse } from "next/server";
import { isApiError, requireApiUser } from "@/server/api";
import { deleteAssignment } from "@/server/repositories";

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(["MANAGER"]);
  if (isApiError(user)) {
    return user;
  }

  const { id } = await context.params;
  await deleteAssignment(id);
  return NextResponse.json({ ok: true });
}
