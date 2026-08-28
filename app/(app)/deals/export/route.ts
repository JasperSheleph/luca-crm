import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/queries/users";
import { can } from "@/lib/domain/permissions";
import { listDeals, parseDealFilters } from "@/lib/queries/deals";
import { STAGE_LABELS } from "@/lib/config/design-tokens";
import type { DealStage } from "@/lib/domain/stages";

/**
 * Downloads the current filtered view as CSV.
 *
 * This is the promise that LUCA is never locked in: whatever the CRM knows,
 * they can take out, on any screen, without asking anyone.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !can(user, "export_deals")) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const p = request.nextUrl.searchParams;
  const { rows } = await listDeals({
    ...parseDealFilters((k) => p.get(k)),
    page: 1,
    perPage: 10000,
  });

  const columns: [string, (r: (typeof rows)[number]) => string | number | null][] = [
    // Same order as the columns on screen, so the file matches what was exported.
    ["Name", (r) => r.customer_name],
    ["Phone", (r) => r.customer_phone],
    ["Source", (r) => r.source_label],
    ["City", (r) => r.city],
    ["Stage", (r) => STAGE_LABELS[r.stage as DealStage] ?? r.stage],
    ["Campaign", (r) => r.campaign_name],
    ["CRM Manager", (r) => r.crm_owner_name],
    ["Sales Rep", (r) => r.rep_owner_name],
    ["Budget", (r) => r.budget_amount],
    ["Budget band", (r) => r.budget_band],
    ["Enquiry date", (r) => r.created_at?.slice(0, 10) ?? null],
    ["First contacted", (r) => r.first_contacted_at?.slice(0, 10) ?? null],
    ["Next action", (r) => r.next_action_at?.slice(0, 10) ?? null],
    ["Next action note", (r) => r.next_action_note],
    ["Activities", (r) => r.activity_count],
    ["Repeat enquiry", (r) => (r.is_repeat ? "yes" : "no")],
    ["Phone needs checking", (r) => (r.invalid_phone ? "yes" : "no")],
    ["Outstation", (r) => (r.is_outstation ? "yes" : "no")],
  ];

  // A leading apostrophe stops Excel reading "+919566114558" as a formula and
  // mangling it, which is the classic way phone numbers get destroyed on export.
  const cell = (v: string | number | null) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };

  const csv = [
    columns.map(([h]) => h).join(","),
    ...rows.map((r) => columns.map(([, get]) => cell(get(r))).join(",")),
  ].join("\n");

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="luca-deals-${stamp}.csv"`,
    },
  });
}
