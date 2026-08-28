"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { setOwnPassword, type AuthState } from "@/lib/actions/auth";
import { inputClass } from "@/components/ui/field";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-navy-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-navy-800 disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save password"}
    </button>
  );
}

export default function ResetForm() {
  const [state, formAction] = useActionState<AuthState, FormData>(setOwnPassword, {});

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-ink">
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          autoFocus
          className={inputClass}
        />
        <p className="mt-1 text-xs text-ink-muted">At least 8 characters.</p>
      </div>

      <div>
        <label htmlFor="confirm" className="mb-1 block text-sm font-medium text-ink">
          Type it again
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={inputClass}
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
