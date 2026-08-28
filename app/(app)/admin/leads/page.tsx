import { requireRole } from "@/lib/auth";
import PageHeader from "@/components/ui/page-header";
import Placeholder from "@/components/ui/placeholder";

export default async function Page() {
  await requireRole("admin");
  return (
    <>
      <PageHeader title="All leads" subtitle="Filter, multi-select, bulk assign or reassign" />
      <Placeholder step="Build step 3">
        Used when onboarding a CRM Manager, covering leave, or rebalancing.
      </Placeholder>
    </>
  );
}
