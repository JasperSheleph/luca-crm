import { requireRole } from "@/lib/auth";
import { listDeals, getDealFilterOptions, parseDealFilters, DEALS_PER_PAGE } from "@/lib/queries/deals";
import { createClient } from "@/lib/db/server";
import { getListValuesFor } from "@/lib/queries/settings";
import PageHeader from "@/components/ui/page-header";
import DealsTable from "../deals/deals-table";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireRole("sales_rep");
  const sp = await searchParams;
  const page = Number(sp.page ?? 1);

  // No owner filter needed: RLS already limits this to the signed-in rep's
  // deals. Another rep's deal returns zero rows, not a hidden row.
  const supabase = await createClient();
  const [{ rows, total }, options, lists, { data: setting }] = await Promise.all([
    listDeals({ ...parseDealFilters((k) => sp[k]), page }),
    getDealFilterOptions(),
    getListValuesFor(["call_disposition", "loss_reason", "not_pursued_reason"]),
    supabase.from("app_settings").select("value").eq("key", "required_fields_for_appointment").maybeSingle(),
  ]);

  return (
    <>
      <PageHeader title="My deals" subtitle="Everything assigned to you." />
      <DealsTable
        rows={rows} total={total} page={page} perPage={DEALS_PER_PAGE}
        options={options} showOwners={false}
        drawer={{
          role: user.role,
          requiredFieldsForAppointment: (setting?.value as string[]) ?? [],
          lists,
          // A rep never makes verification calls — that is the point of the
          // control. The panel still renders, read-only, so they can see why
          // a deal of theirs is frozen.
          canVerify: false,
          canResolveVerification: false,
        }}
      />
    </>
  );
}
