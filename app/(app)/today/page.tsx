import { requireRole } from "@/lib/auth";
import PageHeader from "@/components/ui/page-header";
import Placeholder from "@/components/ui/placeholder";

export default async function Page() {
  await requireRole("sales_rep");
  return (
    <>
      <PageHeader title="Today" subtitle="Appointments today and overdue next actions" />
      <Placeholder step="Build step 5">
        Must be faster than WhatsApp for the rep&rsquo;s own work, or it will not be used.
      </Placeholder>
    </>
  );
}
