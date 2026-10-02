import { HomeView } from "@/components/views/HomeView";
import { getShellContext } from "@/server/shell";

export default async function HomePage() {
  const { user, nav, teams, teamName } = await getShellContext();
  const teamColorSlot = teams.find((team) => team.id === user.teamId)?.colorSlot ?? null;
  return <HomeView user={user} nav={nav} teamName={teamName} teamColorSlot={teamColorSlot} />;
}
