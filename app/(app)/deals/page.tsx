import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { listDeals, getDealFilterOptions, DEALS_PER_PAGE } from "@/lib/queries/deals";
import PageHeader from "@/components/ui/page-header";
import DealsTable from "./deals-table";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireRole("admin", "crm_manager");
  const sp = await searchParams;
  const page = Number(sp.page ?? 1);

  const [{ rows, total }, options] = await Promise.all([
    listDeals({
      q: sp.q, stage: sp.stage, owner: sp.owner, source: sp.source,
      city: sp.city, campaign: sp.campaign, from: sp.from, to: sp.to,
      overdue: sp.overdue === "1", uncontacted: sp.uncontacted === "1",
      page,
    }),
    getDealFilterOptions(),
  ]);

  return (
    <>
      <PageHeader title="Deals" subtitle="Every lead, searchable by phone or name." />
      <Suspense fallback={null}>
        <DealsTable rows={rows} total={total} page={page} perPage={DEALS_PER_PAGE} options={options} />
      </Suspense>
    </>
  );
}
