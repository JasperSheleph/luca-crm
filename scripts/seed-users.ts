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
import { randomBytes } from "node:crypto";

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
 * The real team. crm_manager is a role, not a person — add more holders here
 * or from Admin -> Users and nothing else changes.
 */
const PEOPLE: { name: string; email: string; role: Role }[] = [
  { name: "Jasper Sheleph", email: "rjaspersheleph@gmail.com", role: "admin" },
  { name: "Vishal",         email: "vishal@lucaelevators.com", role: "admin" },
  { name: "Vaishali",       email: "vaishali@lucaelevators.com", role: "admin" },
  { name: "Jennifer",       email: "jennifer@lucaelevators.com", role: "crm_manager" },
  { name: "Rep One",        email: "rep1@lucaelevators.com", role: "sales_rep" },
  { name: "Rep Two",        email: "rep2@lucaelevators.com", role: "sales_rep" },
  { name: "Rep Three",      email: "rep3@lucaelevators.com", role: "sales_rep" },
];

function password(): string {
  // url-safe, no ambiguous characters to misread over the phone
  return randomBytes(12).toString("base64url");
}

async function main() {
  const created: { email: string; role: Role; password: string }[] = [];

  const { data: existing } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const byEmail = new Map((existing?.users ?? []).map((u) => [u.email?.toLowerCase(), u]));

  for (const person of PEOPLE) {
    const found = byEmail.get(person.email.toLowerCase());
    let id = found?.id;

    if (!id) {
      const pw = password();
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
      { id, name: person.name, email: person.email, role: person.role, is_active: true },
      { onConflict: "id" },
    );
    if (profileError) {
      console.error(`  ! ${person.email} profile: ${profileError.message}`);
      continue;
    }
    console.log(`  ${found ? "exists" : "created"}  ${person.role.padEnd(12)} ${person.email}`);
  }

  if (created.length > 0) {
    console.log("\n  New passwords — copy these now, they are not stored anywhere:\n");
    for (const c of created) console.log(`    ${c.email.padEnd(34)} ${c.password}`);
    console.log("\n  Everyone should change their password after first sign-in.");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
