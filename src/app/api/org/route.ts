import { NextResponse } from "next/server";
import { hasPermission, visibleTeams } from "@/lib/permissions";
import { asActor, loadOrg } from "@/server/access";
import { isApiError, requireApiUser } from "@/server/api";
import { listShiftTemplates } from "@/server/org";

// Departments, the teams the person can see, and those teams' shifts. Archived shifts are
// included for people who can configure shifts.
export async function GET() {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  const actor = asActor(user);
  const { departments, teams } = await loadOrg();
  const visible = user.role === "ADMIN" ? teams : visibleTeams(actor, teams);
  const shifts = await listShiftTemplates(
    visible.map((team) => team.id),
    hasPermission(actor, "shifts.configure")
  );
  return NextResponse.json({ departments, teams: visible, shifts });
}
