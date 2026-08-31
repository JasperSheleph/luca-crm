import { requireRole } from "@/lib/auth";
import PageHeader from "@/components/ui/page-header";
import MetaImport from "./meta-import";
import TrackerImport from "./tracker-import";

export default async function Page() {
  await requireRole("admin");
  return (
    <>
      <PageHeader
        title="Import"
        subtitle="Meta first, then the tracker. The order is required — the tracker matches against deals Meta has already created."
      />
      <div className="space-y-4">
        <MetaImport />
        <TrackerImport />
      </div>
    </>
  );
}
