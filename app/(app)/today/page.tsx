import { requireRole } from "@/lib/auth";
import { getToday, getOverdueForMe } from "@/lib/queries/visits";
import PageHeader from "@/components/ui/page-header";
import TodayClient from "./today-client";

/**
 * The rep's screen. Mobile-first, because reps live on phones.
 *
 * Two lists and nothing else: an appointment is a commitment to someone else,
 * an overdue next action is a commitment to yourself, and both are "what do I
 * owe today". Anything more browsable belongs on My Deals.
 *
 * No owner filter on either query — RLS already limits a rep to their own
 * deals, and adding a second filter here would be a rule with two homes.
 */
export default async function Page() {
  await requireRole("sales_rep");

  const [appointments, overdue] = await Promise.all([getToday(), getOverdueForMe()]);

  return (
    <>
      <PageHeader
        title="Today"
        subtitle="Visits booked for today, and follow-ups that have run past their date"
      />
      {/* No Suspense boundary: this route reads cookies, so it is always
          dynamic. Wrapping a client component on a dynamic route leaves it
          server-rendered and never hydrated — see CLAUDE.md. */}
      <TodayClient appointments={appointments} overdue={overdue} />
    </>
  );
}
