"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/server";

/**
 * Marking notifications read.
 *
 * The grant is `update (read_at)` and the policy is `user_id = auth.uid()`, so
 * the database refuses to let anyone mark someone else's notification read, or
 * change anything else about it. That is the guard — these functions only have
 * to be honest.
 *
 * Plain form actions, not useActionState: nothing on this page depends on
 * client state, so it works with or without JavaScript and there is no
 * hydration boundary to get wrong.
 */

/** Only ever navigate inside the app. A stored href is server-written, but an
 *  open redirect is not a thing to leave available on the strength of that. */
function safeHref(href: string | null | undefined): string | null {
  if (!href || !href.startsWith("/") || href.startsWith("//")) return null;
  return href;
}

async function markRead(ids: number[]): Promise<void> {
  if (!ids.length) return;
  const supabase = await createClient();
  await supabase
    .from("notifications_log")
    .update({ read_at: new Date().toISOString() })
    .in("id", ids)
    .is("read_at", null);
}

/** Opens what a notification is about, and marks it read on the way through. */
export async function openNotification(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (id) await markRead([id]);

  const target = safeHref(String(formData.get("href") ?? ""));
  revalidatePath("/notifications", "layout");

  // Outside any try/catch: redirect() signals by throwing.
  redirect(target ?? "/notifications");
}

export async function dismissNotification(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (id) await markRead([id]);
  revalidatePath("/notifications", "layout");
}

export async function markAllRead(): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("notifications_log")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  revalidatePath("/notifications", "layout");
}
