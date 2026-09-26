import { NextResponse } from "next/server";
import { isApiError, jsonError, requireApiUser } from "@/server/api";
import { hasFilesAccess } from "@/server/filesAccess";
import { createSharedFile, listSharedFiles } from "@/server/repositories";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export async function GET() {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  if (!(await hasFilesAccess())) {
    return jsonError("נדרש קוד גישה לקבצים המשותפים.", 423);
  }

  const files = await listSharedFiles();
  return NextResponse.json({ files });
}

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  if (!(await hasFilesAccess())) {
    return jsonError("נדרש קוד גישה לקבצים המשותפים.", 423);
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return jsonError("יש לבחור קובץ להעלאה.");
  }
  if (file.size === 0) {
    return jsonError("הקובץ ריק.");
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return jsonError(
      `הקובץ גדול מדי. הגודל המקסימלי הוא ${Math.floor(MAX_FILE_SIZE_BYTES / (1024 * 1024))}MB.`,
      413
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || "application/octet-stream";

  const sharedFile = await createSharedFile({
    uploadedByUserId: user.id,
    uploadedByName: user.name,
    filename: file.name,
    contentType,
    sizeBytes: file.size,
    data: buffer
  });

  return NextResponse.json({ file: sharedFile }, { status: 201 });
}
