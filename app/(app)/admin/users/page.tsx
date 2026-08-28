import { requireRole } from "@/lib/auth";
import { listUsers } from "@/lib/queries/users";
import PageHeader from "@/components/ui/page-header";
import UsersClient from "./users-client";

export default async function Page() {
  const me = await requireRole("admin");
  const users = await listUsers();
  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Admin and CRM Manager share screens; only the rep view is different."
      />
      <UsersClient users={users} currentUserId={me.id} />
    </>
  );
}
