import { NextResponse } from "next/server";
import type { User } from "@/lib/types";
import { getCurrentUser } from "./auth";

export function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

export function forbidden(message = "אין לך הרשאה לפעולה הזו.") {
  return jsonError(message, 403);
}

/** The signed-in person, or a 401 response. Permission checks happen in each route. */
export async function requireApiUser(): Promise<User | NextResponse> {
  const user = await getCurrentUser();
  return user ?? jsonError("Authentication is required.", 401);
}

export function isApiError(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}
