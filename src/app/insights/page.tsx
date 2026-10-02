import { redirect } from "next/navigation";
import { InsightsView } from "@/components/views/InsightsView";
import { getSundayWeekStart } from "@/lib/dates";
import { getShellContext } from "@/server/shell";

export default async function InsightsPage() {
  const { user, nav, teams, teamName } = await getShellContext();
  if (!nav.insights) {
    redirect("/");
  }
  return (
    <InsightsView
      user={user}
      nav={nav}
      teamName={teamName}
      teamColorSlot={teams.find((team) => team.id === user.teamId)?.colorSlot ?? null}
      thisWeek={getSundayWeekStart()}
    />
  );
}
