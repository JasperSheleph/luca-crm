/**
 * Creates the initial user accounts: auth user + profile row.
 *
 * Idempotent — re-running skips anyone who already exists.
 * Passwords are generated here and printed ONCE. Everyone changes theirs on
 * first sign-in; these are not meant to be long-lived.
 *
 *   npm run users:seed
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Role = "admin" | "crm_manager" | "sales_rep";

/**
 * MOCK ACCOUNTS ONLY — one per role, for validating the build before the demo.
 *
 * Real accounts for Vishal, Vaishali, Jennifer and the reps get created from
 * Admin -> Users at go-live, once LUCA has seen the demo and confirmed who
 * should have what. Nothing here reaches a real person:
 *
 *   - `.test` is a reserved TLD (RFC 2606). It does not resolve and cannot
 *     receive mail, so a stray send has nowhere to go.
 *   - `email_confirm: true` marks the address confirmed without Supabase
 *     sending a confirmation email.
 *
 * The password is shared and deliberately obvious. These accounts hold no real
 * data and are deleted before go-live.
 */
const PASSWORD = "LucaDemo2026!";

const PEOPLE: { name: string; email: string; role: Role; phone: string }[] = [
  { name: "Admin User",  email: "admin@luca.test",      role: "admin",       phone: "9000000001" },
  { name: "CRM Manager", email: "crmmanager@luca.test", role: "crm_manager", phone: "9000000002" },
  { name: "Sales Rep",   email: "salesrep@luca.test",   role: "sales_rep",   phone: "9000000003" },
];

async function main() {
  const created: { email: string; role: Role; password: string }[] = [];

  const { data: existing } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const byEmail = new Map((existing?.users ?? []).map((u) => [u.email?.toLowerCase(), u]));

  for (const person of PEOPLE) {
    const found = byEmail.get(person.email.toLowerCase());
    let id = found?.id;

    if (!id) {
      const pw = PASSWORD;
      const { data, error } = await supabase.auth.admin.createUser({
        email: person.email,
        password: pw,
        email_confirm: true,
      });
      if (error) {
        console.error(`  ! ${person.email}: ${error.message}`);
        continue;
      }
      id = data.user.id;
      created.push({ email: person.email, role: person.role, password: pw });
    }

    const { error: profileError } = await supabase.from("users").upsert(
      { id, name: person.name, email: person.email, role: person.role, phone: person.phone, is_active: true },
      { onConflict: "id" },
    );
    if (profileError) {
      console.error(`  ! ${person.email} profile: ${profileError.message}`);
      continue;
    }
    console.log(`  ${found ? "exists" : "created"}  ${person.role.padEnd(12)} ${person.email}`);
  }

  console.log(`\n  All three accounts use the password: ${PASSWORD}`);
  console.log("  Each can sign in with its mobile number or its email.");
  console.log("  Mock accounts only. Real users are created from Admin -> Users at go-live.\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
