import { requireRole } from "@/lib/auth";
import PageHeader from "@/components/ui/page-header";
import Placeholder from "@/components/ui/placeholder";

export default async function Page() {
  await requireRole("admin", "crm_manager");
  return (
    <>
      <PageHeader title="Work queue" subtitle="To call, awaiting verification, overdue, waking today, quotes past SLA" />
      <Placeholder step="Build step 4">
        Ordered, not browsable. Logging an RNR must be a single keystroke &mdash; RNR is 30% of all outcomes, and this is the adoption test for the whole system.
      </Placeholder>
    </>
  );
}
