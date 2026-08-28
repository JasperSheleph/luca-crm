import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/queries/users";
import { homeFor } from "@/lib/navigation";

export default async function Root() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  redirect(homeFor(user.role));
}
