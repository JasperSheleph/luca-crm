import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/db/server";
import { listDeals } from "@/lib/queries/deals";
import PageHeader from "@/components/ui/page-header";
import LeadsClient from "./leads-client";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireRole("admin");
  const sp = await searchParams;

  const supabase = await createClient();
  const [{ rows }, { data: staff }] = await Promise.all([
    listDeals({
      stage: sp.stage, owner: sp.owner, city: sp.city,
      uncontacted: sp.uncontacted === "1",
      page: Number(sp.page ?? 1), perPage: 200,
    }),
    supabase.from("users").select("id, name, role").eq("is_active", true).order("name"),
  ]);

  return (
    <>
      <PageHeader
        title="All leads"
        subtitle="Select several and hand them over — for onboarding a CRM Manager, covering leave, or rebalancing."
      />
      <LeadsClient
        rows={rows}
        crmManagers={(staff ?? []).filter((u) => u.role === "crm_manager" || u.role === "admin")}
        reps={(staff ?? []).filter((u) => u.role === "sales_rep")}
      />
    </>
  );
}
