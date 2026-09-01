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
        subtitle="Meta leads import whenever you have a new export. The tracker below is a one-time migration of the old spreadsheet, and must run after a Meta import."
      />
      <div className="space-y-4">
        <MetaImport />
        <TrackerImport />
      </div>
    </>
  );
}
