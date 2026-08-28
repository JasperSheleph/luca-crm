import { requireRole } from "@/lib/auth";
import PageHeader from "@/components/ui/page-header";
import Placeholder from "@/components/ui/placeholder";

export default async function Page() {
  await requireRole("admin");
  return (
    <>
      <PageHeader title="Users" subtitle="Create, deactivate, assign roles, trigger a password reset" />
      <Placeholder step="Build step 2">
        Roles are admin, crm_manager and sales_rep. crm_manager is a role, not a person.
      </Placeholder>
    </>
  );
}
