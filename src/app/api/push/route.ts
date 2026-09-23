import { NextResponse } from "next/server";
import { isApiError, jsonError, requireApiUser } from "@/server/api";
import {
  deletePushSubscription,
  getVapidPublicKey,
  savePushSubscription
} from "@/server/notifications";

export async function GET() {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  return NextResponse.json({ publicKey: getVapidPublicKey() });
}

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  const body = await request.json().catch(() => ({}));
  const endpoint = String(body.endpoint ?? "");
  const p256dh = String(body.keys?.p256dh ?? "");
  const auth = String(body.keys?.auth ?? "");
  if (!endpoint.startsWith("https://") || !p256dh || !auth) {
    return jsonError("Invalid push subscription.");
  }
  await savePushSubscription(user.id, { endpoint, keys: { p256dh, auth } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  const body = await request.json().catch(() => ({}));
  await deletePushSubscription(user.id, String(body.endpoint ?? ""));
  return NextResponse.json({ ok: true });
}
