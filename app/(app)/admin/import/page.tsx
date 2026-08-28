import { requireRole } from "@/lib/auth";
import PageHeader from "@/components/ui/page-header";
import MetaImport from "./meta-import";

export default async function Page() {
  await requireRole("admin");
  return (
    <>
      <PageHeader
        title="Import"
        subtitle="Meta Lead Ads CSV. Run this first — the legacy tracker importer depends on it."
      />
      <MetaImport />
    </>
  );
}
