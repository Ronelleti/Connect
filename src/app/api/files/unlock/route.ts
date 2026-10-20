import { NextResponse } from "next/server";
import { isApiError, jsonError, requireApiUser } from "@/server/api";
import { grantFilesAccess, verifyFilesAccessCode } from "@/server/filesAccess";

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }

  const body = await request.json().catch(() => ({}));
  const code = String(body.code ?? "");

  if (!verifyFilesAccessCode(code)) {
    return jsonError("קוד הגישה שגוי.", 401);
  }

  await grantFilesAccess();
  return NextResponse.json({ success: true });
}
