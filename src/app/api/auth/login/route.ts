import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { jsonError } from "@/server/api";
import { verifyPassword } from "@/server/password";
import {
  clearLoginFailures,
  findUserByEmail,
  isLoginRateLimited,
  recordLoginFailure,
  toUser
} from "@/server/repositories";
import { setSessionCookie } from "@/server/session";

export async function POST(request: Request) {
  const body = await request.json();
  const identifier = String(body.email ?? "").trim().toLowerCase();
  const email = identifier.includes("@")
    ? identifier
    : `${identifier}@wecomconnect.local`;
  const password = String(body.password ?? "");
  const clientIp = request.headers.get("x-nf-client-connection-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
  const attemptKey = createHash("sha256")
    .update(`${identifier}|${clientIp}`)
    .digest("hex");

  if (await isLoginRateLimited(attemptKey)) {
    const response = jsonError("Too many login attempts. Try again in 15 minutes.", 429);
    response.headers.set("Retry-After", "900");
    return response;
  }
  const userRow = await findUserByEmail(email);

  if (!userRow || !(await verifyPassword(password, userRow.password_hash))) {
    await recordLoginFailure(attemptKey);
    return jsonError("Invalid email or password.", 401);
  }

  await clearLoginFailures(attemptKey);
  const user = toUser(userRow);
  await setSessionCookie(user);
  return NextResponse.json({ user });
}
