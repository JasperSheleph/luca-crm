import { requireRole } from "@/lib/auth";
import { listDeals, getDealFilterOptions, DEALS_PER_PAGE } from "@/lib/queries/deals";
import PageHeader from "@/components/ui/page-header";
import DealsTable from "../deals/deals-table";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireRole("sales_rep");
  const sp = await searchParams;
  const page = Number(sp.page ?? 1);

  // No owner filter needed: RLS already limits this to the signed-in rep's
  // deals. Another rep's deal returns zero rows, not a hidden row.
  const [{ rows, total }, options] = await Promise.all([
    listDeals({
      q: sp.q, stage: sp.stage, city: sp.city, campaign: sp.campaign,
      overdue: sp.overdue === "1", page,
    }),
    getDealFilterOptions(),
  ]);

  return (
    <>
      <PageHeader title="My deals" subtitle="Everything assigned to you." />
      <DealsTable
        rows={rows} total={total} page={page} perPage={DEALS_PER_PAGE}
        options={options} showOwners={false}
      />
    </>
  );
}
