import { redirect } from "next/navigation";
import type { User } from "@/lib/types";
import { findPerson, toUser } from "./people";
import { getSessionIdentity } from "./session";

/** The signed-in, active person, freshly loaded (role, team and permissions included). */
export async function getCurrentUser(): Promise<User | null> {
  const identity = await getSessionIdentity();
  if (!identity) {
    return null;
  }
  const person = await findPerson(identity.id);
  return person?.isActive ? toUser(person) : null;
}

/** For pages: the signed-in person, or a redirect to the login page. */
export async function requirePageUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}
