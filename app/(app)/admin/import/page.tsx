import { requireRole } from "@/lib/auth";
import PageHeader from "@/components/ui/page-header";
import Placeholder from "@/components/ui/placeholder";

export default async function Page() {
  await requireRole("admin");
  return (
    <>
      <PageHeader title="Import" subtitle="Meta Lead Ads CSV, then the legacy tracker" />
      <Placeholder step="Build steps 2 and 7">
        Order matters: Meta first. The tracker attaches history to existing deals and creates deals only for leads Meta never saw.
      </Placeholder>
    </>
  );
}
