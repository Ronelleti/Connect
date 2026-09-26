import { redirect } from "next/navigation";
import { getAvailabilityWeekStart, getSundayWeekStart, isSundayDateOnly } from "@/lib/dates";
import { getCurrentUser } from "@/server/session";
import { findUserById, toUser } from "@/server/repositories";
import { ScheduleDashboard } from "@/components/ScheduleDashboard";

export default async function SchedulePage({
  searchParams
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sessionUser = await getCurrentUser();

  if (!sessionUser) {
    redirect("/login");
  }
  const userRow = await findUserById(sessionUser.id);
  if (!userRow) {
    redirect("/login");
  }
  const user = toUser(userRow);
  // Notifications about a published week link here with ?week=YYYY-MM-DD.
  const { week } = await searchParams;
  const initialWeekStart = typeof week === "string" && isSundayDateOnly(week) ? week : getSundayWeekStart();

  return (
    <ScheduleDashboard
      currentUser={user}
      initialWeekStart={initialWeekStart}
      initialAvailabilityWeekStart={getAvailabilityWeekStart()}
    />
  );
}
