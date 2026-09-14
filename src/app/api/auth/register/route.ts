import { jsonError } from "@/server/api";

export async function POST() {
  return jsonError("Public registration is disabled. Ask a manager to create the account.", 403);
}
