import { requireRole } from "@/lib/auth";
import PageHeader from "@/components/ui/page-header";
import Placeholder from "@/components/ui/placeholder";

export default async function Page() {
  await requireRole("admin");
  return (
    <>
      <PageHeader title="Dashboard" subtitle="Leads, funnel, contact rate by campaign, lead age at first contact" />
      <Placeholder step="Build step 9">
        Stacked metric cards, mobile-first &mdash; the owners work on phones.
      </Placeholder>
    </>
  );
}
