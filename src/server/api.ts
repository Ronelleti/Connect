import { NextResponse } from "next/server";
import { getCurrentUser } from "./session";
import { findUserById, toUser } from "./repositories";
import type { Role, User } from "@/lib/types";

export function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

export async function requireApiUser(roles?: Role[]): Promise<User | NextResponse> {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return jsonError("Authentication is required.", 401);
  }
  const userRow = await findUserById(sessionUser.id);
  if (!userRow) {
    return jsonError("Authentication is required.", 401);
  }
  const user = toUser(userRow);

  if (roles && !roles.includes(user.role)) {
    return jsonError("You do not have permission for this action.", 403);
  }

  return user;
}

export function isApiError(value: User | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}
