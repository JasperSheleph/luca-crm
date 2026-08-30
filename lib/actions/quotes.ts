"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/server";
import { getCurrentUser } from "@/lib/queries/users";
import { can, canViewDeal } from "@/lib/domain/permissions";
import { canTransition, type DealStage } from "@/lib/domain/stages";
import type { AppUser } from "@/lib/types";

export interface QuoteState { ok?: boolean; error?: string; message?: string }

type Client = Awaited<ReturnType<typeof createClient>>;

/** The bucket's own ceiling. Excel, PDF or a photograph of a printed quote. */
const MAX_BYTES = 25 * 1024 * 1024;

async function context(dealId: string): Promise<
  | { user: AppUser; deal: Record<string, unknown>; supabase: Client }
  | { error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { error: "You are not signed in." };

  const supabase = await createClient();
  const { data: deal } = await supabase.from("deals").select("*").eq("id", dealId).maybeSingle();
  if (!deal) return { error: "That deal no longer exists." };
  if (!canViewDeal(user, deal)) return { error: "You do not have access to that deal." };

  return { user, deal, supabase };
}

function refresh(dealId: string) {
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/deals");
  revalidatePath("/my-deals");
}

/**
 * Upload a quote.
 *
 * Versioned, never replaced: LUCA quote in rounds, and "what did we send them
 * in March" is a question the spreadsheet could never answer. The newest shows
 * and older ones collapse under it.
 *
 * Any file type. They quote from Excel today, print to PDF sometimes, and
 * occasionally photograph a printed sheet — refusing a format here would just
 * push the quote back into WhatsApp where nobody can find it.
 */
export async function uploadQuote(_prev: QuoteState, formData: FormData): Promise<QuoteState> {
  const dealId = String(formData.get("deal_id") ?? "");
  const ctx = await context(dealId);
  if ("error" in ctx) return { error: ctx.error };

  const { user, deal, supabase } = ctx;
  if (!can(user, "upload_quote", deal)) {
    return { error: "You cannot add a quote to that deal." };
  }

  const amountRaw = String(formData.get("amount") ?? "").trim();
  const amount = amountRaw ? Number(amountRaw) : null;
  if (amountRaw && (!Number.isFinite(amount) || amount! <= 0)) {
    return { error: "That is not an amount." };
  }
  if (!amount) return { error: "Enter the quoted amount — it is what the dashboard counts." };

  const file = formData.get("file");
  const hasFile = file instanceof File && file.size > 0;
  if (hasFile && file.size > MAX_BYTES) return { error: "That file is over 25 MB." };

  const stage = deal.stage as DealStage;
  const moving = stage !== "quote_sent" && stage !== "negotiation";

  // The verification gate. Quoting for a visit the customer never confirmed is
  // exactly what this whole mechanism exists to prevent, so the check happens
  // before anything is written, and it happens in stages.ts like every other.
  if (moving) {
    const verdict = canTransition("quote_sent", {
      role: user.role,
      requiredFieldsForAppointment: [],
      deal: deal as never,
    });
    if (!verdict.ok) return { error: verdict.reason };
  }

  const { data: latest } = await supabase
    .from("quotes").select("version_no").eq("deal_id", dealId)
    .order("version_no", { ascending: false }).limit(1).maybeSingle();
  const versionNo = (latest?.version_no ?? 0) + 1;

  let path: string | null = null;
  if (hasFile) {
    const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
    // First path segment must be the deal id — the storage policies read it
    // out of the name. See 20260828120300_storage.sql.
    path = `${dealId}/v${versionNo}-${crypto.randomUUID()}.${ext}`;
    const { error: upload } = await supabase.storage
      .from("quotes")
      .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (upload) return { error: upload.message };
  }

  const now = new Date().toISOString();
  const isFinal = formData.get("is_final") === "on";
  const notes = String(formData.get("notes") ?? "").trim();

  const { error } = await supabase.from("quotes").insert({
    deal_id: dealId,
    version_no: versionNo,
    file_url: path,
    file_type: hasFile ? file.type || null : null,
    amount,
    is_final: isFinal,
    notes: notes || null,
    sent_by: user.id,
    sent_at: now,
  });
  if (error) return { error: error.message };

  // latest_quote_amount is what the list and the dashboard read; sent_at is
  // what the Quotes-past-SLA queue compares against, through
  // deal_list_view.latest_quote_sent_at.
  const patch: Record<string, unknown> = { latest_quote_amount: amount };
  if (moving) patch.stage = "quote_sent";
  await supabase.from("deals").update(patch).eq("id", dealId);

  if (moving) {
    await supabase.from("deal_stage_history").insert({
      deal_id: dealId, from_stage: stage, to_stage: "quote_sent", changed_by: user.id,
    });
    await supabase.from("activities").insert({
      deal_id: dealId, user_id: user.id, type: "stage_change",
      metadata: { from: stage, to: "quote_sent" },
    });
  }

  await supabase.from("activities").insert({
    deal_id: dealId,
    user_id: user.id,
    type: "quote_sent",
    notes: notes || null,
    metadata: { version_no: versionNo, amount, is_final: isFinal, has_file: hasFile },
  });

  refresh(dealId);
  return { ok: true, message: `Quote v${versionNo} saved.` };
}
