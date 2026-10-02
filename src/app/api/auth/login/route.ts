import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { jsonError } from "@/server/api";
import { verifyPassword } from "@/server/password";
import {
  clearLoginFailures,
  findLoginByEmail,
  isLoginRateLimited,
  recordLoginFailure,
  toUser
} from "@/server/people";
import { setSessionCookie } from "@/server/session";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
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
    const response = jsonError("יותר מדי ניסיונות כניסה. נסו שוב בעוד 15 דקות.", 429);
    response.headers.set("Retry-After", "900");
    return response;
  }
  const login = await findLoginByEmail(email);

  if (!login || !login.person.isActive || !(await verifyPassword(password, login.passwordHash))) {
    await recordLoginFailure(attemptKey);
    return jsonError("אימייל או סיסמה שגויים.", 401);
  }

  await clearLoginFailures(attemptKey);
  await setSessionCookie({ id: login.person.id });
  return NextResponse.json({ user: toUser(login.person) });
}
