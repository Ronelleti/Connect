import { PeopleView } from "@/components/views/PeopleView";
import { getShellContext } from "@/server/shell";

export default async function PeoplePage() {
  const { user, nav, teams, teamName } = await getShellContext();
  return <PeopleView user={user} nav={nav} teamName={teamName} teamColorSlot={teams.find((team) => team.id === user.teamId)?.colorSlot ?? null} />;
}
