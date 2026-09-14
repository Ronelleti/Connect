import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/session";
import { findUserById, toUser } from "@/server/repositories";

export async function GET() {
  const sessionUser = await getCurrentUser();
  const userRow = sessionUser ? await findUserById(sessionUser.id) : null;
  return NextResponse.json({ user: userRow ? toUser(userRow) : null });
}
