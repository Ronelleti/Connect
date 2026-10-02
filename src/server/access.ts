import { can, type Actor, type Permission } from "@/lib/permissions";
import type { Team, User } from "@/lib/types";
import { query } from "./db";
import { listDepartments, listTeams } from "./org";
import { listPeople } from "./people";

export async function loadOrg() {
  const [departments, teams] = await Promise.all([listDepartments(), listTeams()]);
  return { departments, teams };
}

export function asActor(user: User): Actor {
  return {
    id: user.id,
    role: user.role,
    departmentId: user.departmentId,
    teamId: user.teamId,
    extraPermissions: user.extraPermissions
  };
}

/** Active people holding the permission for this team (admins, its department's managers, and team members with it). */
export async function listUserIdsWithPermission(team: Team, permission: Permission) {
  const candidates = await listPeople({ teamIds: [team.id], departmentIds: [team.departmentId] });
  const admins = await query<{ id: string }>("SELECT id FROM users WHERE role = 'ADMIN' AND is_active");
  const ids = new Set(admins.map((row) => row.id));
  for (const person of candidates) {
    if (can(person, permission, team)) {
      ids.add(person.id);
    }
  }
  return Array.from(ids);
}
