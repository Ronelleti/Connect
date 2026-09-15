import { NextResponse } from "next/server";
import { isApiError, jsonError, requireApiUser } from "@/server/api";
import { hasFilesAccess } from "@/server/filesAccess";
import { findSharedFileWithData } from "@/server/repositories";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  if (!(await hasFilesAccess())) {
    return jsonError("נדרש קוד גישה לקבצים המשותפים.", 423);
  }

  const { id } = await context.params;
  const file = await findSharedFileWithData(id);
  if (!file) {
    return jsonError("הקובץ לא נמצא.", 404);
  }

  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.meta.contentType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.meta.filename)}`,
      "Content-Length": String(file.meta.sizeBytes)
    }
  });
}
