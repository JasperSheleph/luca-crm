import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/queries/users";
import type { Role } from "@/lib/domain/permissions";
import type { AppUser } from "@/lib/types";

/** Signed-in user, or redirect to login. */
export async function requireUser(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Route guard. Belt-and-braces on top of RLS: RLS is what actually protects
 * the data, this just stops someone landing on a screen full of empty states.
 */
export async function requireRole(...roles: Role[]): Promise<AppUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/");
  return user;
}
