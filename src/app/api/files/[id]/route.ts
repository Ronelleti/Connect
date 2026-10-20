import { NextResponse } from "next/server";
import { isApiError, jsonError, requireApiUser } from "@/server/api";
import { hasFilesAccess } from "@/server/filesAccess";
import { deleteSharedFile, findSharedFileMeta } from "@/server/repositories";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  if (!(await hasFilesAccess())) {
    return jsonError("נדרש קוד גישה לקבצים המשותפים.", 423);
  }

  const { id } = await context.params;
  const file = await findSharedFileMeta(id);
  if (!file) {
    return jsonError("הקובץ לא נמצא.", 404);
  }

  if (file.uploadedByUserId !== user.id && user.role !== "MANAGER") {
    return jsonError("אין לך הרשאה למחוק קובץ זה.", 403);
  }

  await deleteSharedFile(id);
  return NextResponse.json({ success: true });
}
