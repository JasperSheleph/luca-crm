"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";
import { getCurrentUser } from "@/lib/queries/users";
import { can } from "@/lib/domain/permissions";

export interface UserActionState {
  ok?: boolean;
  error?: string;
  message?: string;
  /** A recovery link to hand over in person. Nothing is emailed. */
  resetLink?: string;
}

const NewUser = z.object({
  name: z.string().trim().min(1, "Enter a name"),
  email: z.email("Enter a valid email"),
  role: z.enum(["admin", "crm_manager", "sales_rep"]),
  phone: z.string().trim().optional(),
});

/**
 * Builds the link an admin hands over in person.
 *
 * Supabase's own action_link redirects via the project's configured Site URL,
 * which is one more thing to keep correct across localhost, staging and
 * production. Using the hashed token against our own /auth/confirm route means
 * the link always points at whatever host the admin is actually using.
 */
async function recoveryLink(hashedToken: string | undefined): Promise<string | undefined> {
  if (!hashedToken) return undefined;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return undefined;
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/auth/confirm?token_hash=${hashedToken}&type=recovery&next=/reset-password`;
}

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || !can(user, "manage_users")) return null;
  return user;
}

export async function createUser(_prev: UserActionState, formData: FormData): Promise<UserActionState> {
  const actor = await requireAdmin();
  if (!actor) return { error: "Only an admin can manage users." };

  const parsed = NewUser.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
    phone: formData.get("phone") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { name, email, role, phone } = parsed.data;
  const db = createAdminClient();

  // email_confirm skips Supabase's confirmation email. Nothing is sent to
  // anyone; the admin hands over the recovery link below in person.
  const { data: created, error: authError } = await db.auth.admin.createUser({
    email, email_confirm: true,
  });
  if (authError || !created?.user) {
    return { error: authError?.message ?? "Could not create the sign-in account." };
  }

  const { error: profileError } = await db.from("users").insert({
    id: created.user.id, name, email, role, phone: phone ?? null, is_active: true,
  });
  if (profileError) {
    // Do not leave an auth user with no profile — it would block re-adding them.
    await db.auth.admin.deleteUser(created.user.id);
    return { error: profileError.message };
  }

  const { data: link } = await db.auth.admin.generateLink({ type: "recovery", email });

  revalidatePath("/admin/users");
  return {
    ok: true,
    message: `${name} added. Give them the link below so they can set a password.`,
    resetLink: await recoveryLink(link?.properties?.hashed_token),
  };
}

/**
 * Deactivate rather than delete: a deleted user cascades away, and their name
 * disappears from every activity and assignment they ever made.
 */
export async function setUserActive(_prev: UserActionState, formData: FormData): Promise<UserActionState> {
  const actor = await requireAdmin();
  if (!actor) return { error: "Only an admin can manage users." };

  const id = String(formData.get("id"));
  const isActive = String(formData.get("is_active")) === "true";
  if (id === actor.id && !isActive) return { error: "You cannot deactivate your own account." };

  const supabase = await createClient();
  const { error } = await supabase.from("users").update({ is_active: isActive }).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/users");
  return { ok: true, message: isActive ? "Reactivated." : "Deactivated. They can no longer sign in." };
}

export async function setUserRole(_prev: UserActionState, formData: FormData): Promise<UserActionState> {
  const actor = await requireAdmin();
  if (!actor) return { error: "Only an admin can manage users." };

  const id = String(formData.get("id"));
  const role = String(formData.get("role"));
  if (!["admin", "crm_manager", "sales_rep"].includes(role)) return { error: "Unknown role." };
  if (id === actor.id && role !== "admin") return { error: "You cannot remove your own admin access." };

  const supabase = await createClient();

  // Never leave the system with no admin — nobody could manage users or settings.
  if (role !== "admin") {
    const { count } = await supabase
      .from("users").select("id", { count: "exact", head: true })
      .eq("role", "admin").eq("is_active", true);
    if ((count ?? 0) <= 1) return { error: "There must always be at least one active admin." };
  }

  const { error } = await supabase.from("users").update({ role }).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/users");
  return { ok: true, message: "Role updated." };
}

export async function resetPassword(_prev: UserActionState, formData: FormData): Promise<UserActionState> {
  const actor = await requireAdmin();
  if (!actor) return { error: "Only an admin can manage users." };

  const email = String(formData.get("email"));
  const db = createAdminClient();
  const { data, error } = await db.auth.admin.generateLink({ type: "recovery", email });
  if (error) return { error: error.message };

  return {
    ok: true,
    message: "Link ready. Nothing was emailed — copy it and give it to them directly. It works once and then expires.",
    resetLink: await recoveryLink(data?.properties?.hashed_token),
  };
}
