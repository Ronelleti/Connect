import { hasPermission, teamsWithPermission, visibleTeams } from "@/lib/permissions";
import type { Team, User } from "@/lib/types";
import { asActor, loadOrg } from "./access";
import { requirePageUser } from "./auth";

export interface ShellNav {
  insights: boolean;
  settings: boolean;
  manageTeam: boolean;
}

export interface ShellContext {
  user: User;
  nav: ShellNav;
  teams: Team[];
  teamName: string | null;
}

/** The signed-in person plus what the navigation should offer them. */
export async function getShellContext(): Promise<ShellContext> {
  const user = await requirePageUser();
  const actor = asActor(user);
  const { teams } = await loadOrg();
  return {
    user,
    teams: user.role === "ADMIN" ? teams : visibleTeams(actor, teams),
    teamName: teams.find((team) => team.id === user.teamId)?.name ?? null,
    nav: {
      insights: teamsWithPermission(actor, "reports.view", teams).length > 0,
      settings: user.role === "ADMIN" || teamsWithPermission(actor, "shifts.configure", teams).length > 0,
      manageTeam: user.role === "ADMIN" || hasPermission(actor, "people.manage")
    }
  };
}
