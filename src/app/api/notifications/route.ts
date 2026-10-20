import { NextResponse } from "next/server";
import { isApiError, requireApiUser } from "@/server/api";
import { listNotifications, markNotificationsRead } from "@/server/notifications";

export async function GET() {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  return NextResponse.json(await listNotifications(user.id));
}

// Marks one notification (body.id) or all of the user's notifications as read.
export async function PATCH(request: Request) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  const body = await request.json().catch(() => ({}));
  await markNotificationsRead(user.id, body.id ? String(body.id) : undefined);
  return NextResponse.json({ ok: true });
}
