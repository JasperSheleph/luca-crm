import { requireRole } from "@/lib/auth";
import PageHeader from "@/components/ui/page-header";
import Placeholder from "@/components/ui/placeholder";

export default async function Page() {
  await requireRole("sales_rep");
  return (
    <>
      <PageHeader title="My deals" subtitle="Only deals assigned to you" />
      <Placeholder step="Build step 5">
        Scoped by RLS, not by a hidden UI element &mdash; another rep&rsquo;s deal returns zero rows.
      </Placeholder>
    </>
  );
}
