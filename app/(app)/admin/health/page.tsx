import { requireRole } from "@/lib/auth";
import PageHeader from "@/components/ui/page-header";
import Placeholder from "@/components/ui/placeholder";

export default async function Page() {
  await requireRole("admin");
  return (
    <>
      <PageHeader title="Health" subtitle="Last import, WhatsApp, failed jobs, storage, database" />
      <Placeholder step="Build step 9">
        Plain language, readable by someone who does not code.
      </Placeholder>
    </>
  );
}
