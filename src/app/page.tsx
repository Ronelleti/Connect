import { redirect } from "next/navigation";
import { getAvailabilityWeekStart, getSundayWeekStart } from "@/lib/dates";
import { getCurrentUser } from "@/server/session";
import { findUserById, toUser } from "@/server/repositories";
import { ScheduleDashboard } from "@/components/ScheduleDashboard";

export default async function HomePage() {
  const sessionUser = await getCurrentUser();

  if (!sessionUser) {
    redirect("/login");
  }
  const userRow = await findUserById(sessionUser.id);
  if (!userRow) {
    redirect("/login");
  }
  const user = toUser(userRow);

  return (
    <ScheduleDashboard
      currentUser={user}
      initialWeekStart={getSundayWeekStart()}
      initialAvailabilityWeekStart={getAvailabilityWeekStart()}
    />
  );
}
