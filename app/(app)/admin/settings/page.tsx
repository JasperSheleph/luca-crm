import { requireRole } from "@/lib/auth";
import PageHeader from "@/components/ui/page-header";
import Placeholder from "@/components/ui/placeholder";

export default async function Page() {
  await requireRole("admin");
  return (
    <>
      <PageHeader title="Settings" subtitle="Dropdown values, assignment mode, notification rules" />
      <Placeholder step="Build step 2">
        Everything configurable is a database row. Values can be deactivated, never deleted.
      </Placeholder>
    </>
  );
}
