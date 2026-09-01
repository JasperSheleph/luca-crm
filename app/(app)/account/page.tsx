import { requireUser } from "@/lib/auth";
import { signOut } from "@/lib/actions/auth";
import { ROLE_LABELS } from "@/lib/domain/permissions";
import PageHeader from "@/components/ui/page-header";
import Card from "@/components/ui/card";
import Button from "@/components/ui/button";

/**
 * Who you are, and the way out.
 *
 * Exists because the sidebar carries both and the sidebar is desktop-only —
 * on a phone there was no way to sign out at all, which matters most for the
 * reps, who are the ones who never see a desktop.
 *
 * A route rather than a menu: it works without JavaScript, it can be linked to,
 * and there is one obvious place to add anything else about the person later.
 */
export default async function Page() {
  const user = await requireUser();

  return (
    <>
      <PageHeader title="Account" subtitle="Who you are signed in as" />

      <div className="max-w-md space-y-4">
        <Card title={user.name}>
          <dl className="space-y-2 text-sm">
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-ink-muted">Role</dt>
              <dd className="text-ink">{ROLE_LABELS[user.role]}</dd>
            </div>
            {user.phone && (
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-ink-muted">Mobile</dt>
                <dd className="tabular text-ink">{user.phone}</dd>
              </div>
            )}
            {user.email && (
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-ink-muted">Email</dt>
                <dd className="break-all text-ink">{user.email}</dd>
              </div>
            )}
          </dl>
          <p className="mt-3 text-xs text-ink-muted">
            Ask an admin to change any of this, or to reset your password.
          </p>
        </Card>

        <form action={signOut}>
          <Button type="submit" variant="secondary">Sign out</Button>
        </form>
      </div>
    </>
  );
}
