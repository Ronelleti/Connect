import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/session";
import { findUserById, toUser } from "@/server/repositories";
import { MyDashboard } from "@/components/MyDashboard";

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

  return <MyDashboard currentUser={user} />;
}
