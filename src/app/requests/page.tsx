import { RequestsView } from "@/components/views/RequestsView";
import { getShellContext } from "@/server/shell";

export default async function RequestsPage({
  searchParams
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { user, nav, teams, teamName } = await getShellContext();
  const { tab } = await searchParams;
  return (
    <RequestsView
      user={user}
      nav={nav}
      teamName={teamName}
      teamColorSlot={teams.find((team) => team.id === user.teamId)?.colorSlot ?? null}
      initialTab={tab === "board" || tab === "approvals" ? tab : "mine"}
    />
  );
}
