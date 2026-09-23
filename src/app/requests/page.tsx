import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/session";
import { findUserById, toUser } from "@/server/repositories";
import { RequestsCenter } from "@/components/RequestsCenter";

export default async function RequestsPage() {
  const sessionUser = await getCurrentUser();

  if (!sessionUser) {
    redirect("/login");
  }
  const userRow = await findUserById(sessionUser.id);
  if (!userRow) {
    redirect("/login");
  }
  const user = toUser(userRow);

  return <RequestsCenter currentUser={user} />;
}
