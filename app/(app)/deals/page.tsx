import { requireRole } from "@/lib/auth";
import PageHeader from "@/components/ui/page-header";
import Placeholder from "@/components/ui/placeholder";

export default async function Page() {
  await requireRole("admin", "crm_manager");
  return (
    <>
      <PageHeader title="Deals" subtitle="Search by phone or name; filter by stage, owner, source, city, campaign" />
      <Placeholder step="Build step 3">
        The shared, role-gated deals list, with the export button that guarantees LUCA is never locked in.
      </Placeholder>
    </>
  );
}
