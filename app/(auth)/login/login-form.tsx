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
  const linkProblem = params.get("error");
  const [state, formAction] = useActionState<AuthState, FormData>(signIn, {});

  // A password link is single-use and expires. Say so, rather than dropping
  // someone on a bare sign-in form wondering what went wrong.
  const linkMessage =
    linkProblem === "link_expired"
      ? "That password link has already been used or has expired. Ask an admin for a new one."
      : linkProblem === "link_invalid"
        ? "That password link is not valid. Ask an admin for a new one."
        : null;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />

      {linkMessage && (
        <p className="rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">{linkMessage}</p>
      )}

      <div>
        <label htmlFor="identifier" className="mb-1 block text-sm font-medium text-ink">
          Mobile number or email
        </label>
        <input
          id="identifier" name="identifier" type="text" required
          inputMode="text" autoComplete="username" autoFocus
          placeholder="9566114558"
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
