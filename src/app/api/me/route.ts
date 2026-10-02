import { NextResponse } from "next/server";
import { effectivePermissions, PERMISSIONS, teamsWithPermission, visibleTeams } from "@/lib/permissions";
import { asActor, loadOrg } from "@/server/access";
import { isApiError, requireApiUser } from "@/server/api";

// Who is signed in, which teams they can see, and where each permission applies.
export async function GET() {
  const user = await requireApiUser();
  if (isApiError(user)) {
    return user;
  }
  const actor = asActor(user);
  const { departments, teams } = await loadOrg();
  const scopes = Object.fromEntries(
    PERMISSIONS.map((permission) => [permission, teamsWithPermission(actor, permission, teams).map((team) => team.id)])
  );
  return NextResponse.json({
    user,
    permissions: Array.from(effectivePermissions(actor)),
    departments,
    teams: visibleTeams(actor, teams),
    scopes
  });
}
