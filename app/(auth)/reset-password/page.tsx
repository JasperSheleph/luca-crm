import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/server";
import ResetForm from "./reset-form";

export const metadata = { title: "Choose a password · LUCA CRM" };

export default async function ResetPasswordPage() {
  // Reached only through /auth/confirm, which exchanges the one-time token for
  // a session. No session means the link was stale, reused, or skipped.
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data?.user) redirect("/login?error=link_expired");

  return (
    <main className="grid min-h-dvh place-items-center bg-navy-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Image
            src="/luca-logo.png"
            alt="LUCA Elevators"
            width={260}
            height={67}
            priority
            className="h-auto w-[220px]"
          />
        </div>

        <div className="rounded-lg border border-border bg-paper p-6 shadow-sm">
          <h1 className="mb-1 text-lg font-semibold text-ink">Choose a password</h1>
          <p className="mb-5 text-sm text-ink-muted">
            Signed in as {data.user.email}. Pick something only you know.
          </p>
          <ResetForm />
        </div>
      </div>
    </main>
  );
}
