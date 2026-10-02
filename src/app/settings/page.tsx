import { redirect } from "next/navigation";
import { SettingsView } from "@/components/views/SettingsView";
import { getShellContext } from "@/server/shell";

export default async function SettingsPage() {
  const { user, nav, teams, teamName } = await getShellContext();
  if (!nav.settings) {
    redirect("/");
  }
  return <SettingsView user={user} nav={nav} teamName={teamName} teamColorSlot={teams.find((team) => team.id === user.teamId)?.colorSlot ?? null} />;
}
