import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/session";
import { findUserById, toUser } from "@/server/repositories";
import { FilesLibrary } from "@/components/FilesLibrary";

export default async function FilesPage() {
  const sessionUser = await getCurrentUser();

  if (!sessionUser) {
    redirect("/login");
  }
  const userRow = await findUserById(sessionUser.id);
  if (!userRow) {
    redirect("/login");
  }
  const user = toUser(userRow);

  return <FilesLibrary currentUser={user} />;
}
