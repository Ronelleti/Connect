import { NextResponse } from "next/server";
import { isApiError, jsonError, requireApiUser } from "@/server/api";
import { getPushConfig, sendTestPush } from "@/server/notifications";

// Sends a test push to the signed-in user's own devices and reports the outcome, so
// anyone can check that phone notifications work end to end.
export async function POST() {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  const config = getPushConfig();
  if (!config.ok) {
    return jsonError(config.problem, 503);
  }
  return NextResponse.json(await sendTestPush(user.id));
}
