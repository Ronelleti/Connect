import { FilesLibrary } from "@/components/FilesLibrary";
import { getShellContext } from "@/server/shell";

export default async function FilesPage() {
  const { user, nav, teams, teamName } = await getShellContext();
  return <FilesLibrary user={user} nav={nav} teamName={teamName} teamColorSlot={teams.find((team) => team.id === user.teamId)?.colorSlot ?? null} />;
}
