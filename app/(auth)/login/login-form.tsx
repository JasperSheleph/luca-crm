"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { useFormStatus } from "react-dom";
import { signIn, type AuthState } from "@/lib/actions/auth";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-navy-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-navy-800 disabled:opacity-60"
    >
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}

export default function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const [state, formAction] = useActionState<AuthState, FormData>(signIn, {});

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />

      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-ink">Email</label>
        <input
          id="email" name="email" type="email" required autoComplete="email" autoFocus
          className="w-full rounded-md border border-border bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-navy-700"
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-ink">Password</label>
        <input
          id="password" name="password" type="password" required autoComplete="current-password"
          className="w-full rounded-md border border-border bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-navy-700"
        />
      </div>

      {state.error && (
        <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
