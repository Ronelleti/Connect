import { NextResponse } from "next/server";
import { isApiError, jsonError, requireApiUser } from "@/server/api";
import {
  countPushSubscriptions,
  deletePushSubscription,
  getPushConfig,
  savePushSubscription
} from "@/server/notifications";

export async function GET() {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  const config = getPushConfig();
  return NextResponse.json({
    publicKey: config.ok ? config.publicKey : null,
    // What is wrong with the server's push settings (never includes a key's value).
    problem: config.ok ? null : config.problem,
    deviceCount: await countPushSubscriptions(user.id)
  });
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
