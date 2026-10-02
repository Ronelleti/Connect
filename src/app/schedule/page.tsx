import { ScheduleView } from "@/components/views/ScheduleView";
import { getScheduleTimeParts, getSundayWeekStart, isSundayDateOnly } from "@/lib/dates";
import { getShellContext } from "@/server/shell";

export default async function SchedulePage({
  searchParams
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { user, nav, teams, teamName } = await getShellContext();
  const { week, team } = await searchParams;
  const thisWeek = getSundayWeekStart();
  const initialTeamId = typeof team === "string" && teams.some((option) => option.id === team) ? team : user.teamId ?? teams[0]?.id ?? null;
  return (
    <ScheduleView
      user={user}
      nav={nav}
      teamName={teamName}
      teamColorSlot={teams.find((option) => option.id === user.teamId)?.colorSlot ?? null}
      teams={teams}
      initialTeamId={initialTeamId}
      initialWeek={typeof week === "string" && isSundayDateOnly(week) ? week : thisWeek}
      thisWeek={thisWeek}
      today={getScheduleTimeParts().dateOnly}
    />
  );
}
