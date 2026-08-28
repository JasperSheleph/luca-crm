import Image from "next/image";
import { Suspense } from "react";
import LoginForm from "./login-form";

export const metadata = { title: "Sign in · LUCA CRM" };

export default function LoginPage() {
  return (
    <main className="min-h-dvh grid place-items-center bg-navy-50 px-4">
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
          <h1 className="mb-1 text-lg font-semibold text-ink">Sign in</h1>
          <p className="mb-5 text-sm text-ink-muted">Lead and deal management.</p>
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-xs text-ink-muted">
          Trouble signing in? Ask an admin to reset your password.
        </p>
      </div>
    </main>
  );
}
