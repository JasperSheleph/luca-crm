import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/db/server";
import { listDeals, getDealFilterOptions, parseDealFilters, DEALS_PER_PAGE } from "@/lib/queries/deals";
import { can } from "@/lib/domain/permissions";
import { getListValuesFor } from "@/lib/queries/settings";
import PageHeader from "@/components/ui/page-header";
import DealsTable from "./deals-table";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireRole("admin", "crm_manager");
  const sp = await searchParams;
  const page = Number(sp.page ?? 1);

  const supabase = await createClient();
  const [{ rows, total }, options, { data: staff }, lists, { data: setting }] = await Promise.all([
    listDeals({ ...parseDealFilters((k) => sp[k]), page }),
    getDealFilterOptions(),
    supabase.from("users").select("id, name, role").eq("is_active", true).order("name"),
    // The slide-over needs these, and they are the same for every lead — so
    // they are read once here rather than on each /api/deals/[id] call.
    getListValuesFor(["call_disposition", "loss_reason", "not_pursued_reason"]),
    supabase.from("app_settings").select("value").eq("key", "required_fields_for_appointment").maybeSingle(),
  ]);

  return (
    <>
      <PageHeader
        title="Deals"
        subtitle="Every lead, searchable by phone or name. Use Select to hand several over at once."
      />
      {/* No Suspense boundary here on purpose. DealsTable calls
          useSearchParams(), which only needs one when the route is statically
          rendered — this route reads cookies, so it is always dynamic. Wrapping
          it in <Suspense fallback={null}> left the table server-rendered but
          never hydrated: rows appeared, and no button, filter or checkbox
          worked. */}
      <DealsTable
        rows={rows} total={total} page={page} perPage={DEALS_PER_PAGE} options={options}
        drawer={{
          role: user.role,
          requiredFieldsForAppointment: (setting?.value as string[]) ?? [],
          lists,
        }}
        bulk={{
          crmManagers: (staff ?? []).filter((u) => u.role === "crm_manager" || u.role === "admin"),
          reps: (staff ?? []).filter((u) => u.role === "sales_rep"),
          canAssignManager: can(user, "assign_lead_to_crm_manager"),
          canAssignRep: can(user, "assign_lead_to_rep"),
        }}
      />
    </>
  );
}
