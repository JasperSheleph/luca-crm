"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/server";
import { createAdminClient } from "@/lib/db/admin";
import { normalizePhone, isValidIndianMobile } from "@/lib/domain/phone";

export interface AuthState {
  error?: string;
}

/**
 * Resolves a mobile number to the account's email.
 *
 * Reps work from phones and know their own number better than an email address
 * someone assigned them, so the login box takes either. Supabase phone auth
 * would mean a paid SMS provider and a vendor to keep alive; this needs
 * neither, because the password check is unchanged — only the identifier moves.
 *
 * Uses the service-role client deliberately: `users` is behind RLS and a
 * visitor who has not signed in yet cannot read it.
 */
async function emailForIdentifier(identifier: string): Promise<string | null> {
  const normalized = normalizePhone(identifier);
  if (!normalized || !isValidIndianMobile(normalized)) return null;

  const { data } = await createAdminClient()
    .from("users")
    .select("email")
    .eq("phone_normalized", normalized)
    .maybeSingle();

  return data?.email ?? null;
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const identifier = String(formData.get("identifier") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");

  if (!identifier || !password) {
    return { error: "Enter your mobile number or email, and your password." };
  }

  // A mobile resolves to the account behind it; anything else is treated as an
  // email. An unmatched mobile falls through to the same failure as a wrong
  // password, so this never becomes a way to discover who has an account.
  const email = (await emailForIdentifier(identifier)) ?? identifier;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  // Deliberately vague: a precise message tells an attacker which half was right.
  if (error) return { error: "That did not match an account. Check the number or email, and the password." };

  revalidatePath("/", "layout");
  redirect(next.startsWith("/") ? next : "/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

/**
 * Sets the signed-in user's own password. Reached from /reset-password, after
 * /auth/confirm has exchanged a one-time recovery token for a session.
 */
export async function setOwnPassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) return { error: "Use at least 8 characters." };
  if (password !== confirm) return { error: "Those two passwords do not match." };

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data?.user) return { error: "That link has expired. Ask an admin for a new one." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect("/");
}
