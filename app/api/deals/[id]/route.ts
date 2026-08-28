import { NextResponse } from "next/server";
import { getDeal, getTimeline } from "@/lib/queries/deals";
import { getCurrentUser } from "@/lib/queries/users";
import { canViewDeal } from "@/lib/domain/permissions";

/**
 * One lead, for the slide-over on the deals list.
 *
 * Only the parts that change per deal: everything else the drawer needs —
 * dropdown values, staff, the appointment gate, permissions — is constant
 * across leads and is passed to the drawer once as props.
 *
 * Runs as the signed-in user, so RLS applies exactly as it does everywhere
 * else: a rep asking for someone else's lead gets a 404, not a payload.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const deal = await getDeal(id);
  if (!deal || !canViewDeal(user, deal)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const timeline = await getTimeline(id);

  return NextResponse.json(
    { deal, timeline },
    // Private to this user and short-lived: the timeline changes the moment
    // they log a call, and arrow-keying back should not show a stale one.
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
