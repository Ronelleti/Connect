import { redirect } from "next/navigation";
import { AvailabilityView } from "@/components/views/AvailabilityView";
import { getScheduleTimeParts } from "@/lib/dates";
import { getShellContext } from "@/server/shell";

export default async function AvailabilityPage() {
  const { user, nav, teams, teamName } = await getShellContext();
  if (!user.teamId) {
    redirect("/");
  }
  return (
    <AvailabilityView
      user={user}
      nav={nav}
      teamName={teamName}
      teamColorSlot={teams.find((team) => team.id === user.teamId)?.colorSlot ?? null}
      today={getScheduleTimeParts().dateOnly}
    />
  );
}
