import { requireUser } from "@/lib/auth";
import { listNotifications } from "@/lib/queries/notifications";
import {
  openNotification, dismissNotification, markAllRead,
} from "@/lib/actions/notifications";
import PageHeader from "@/components/ui/page-header";
import Card from "@/components/ui/card";
import Button from "@/components/ui/button";
import Badge from "@/components/ui/badge";
import { formatDateTime } from "@/lib/config/design-tokens";

/**
 * The in-app notification centre.
 *
 * This is where every notification lands, whether or not WhatsApp is switched
 * on — so the system is useful before Meta has approved a single template.
 *
 * Plain forms throughout, no client component: nothing here needs client
 * state, so there is no hydration boundary that could leave the buttons dead.
 */
export default async function Page() {
  await requireUser();
  const notifications = await listNotifications();
  const unread = notifications.filter((n) => !n.read_at).length;

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle={unread ? `${unread} unread` : "Nothing unread"}
        actions={
          unread > 0 ? (
            <form action={markAllRead}>
              <Button size="sm" variant="secondary" type="submit">Mark all as read</Button>
            </form>
          ) : undefined
        }
      />

      <Card>
        {notifications.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">
            Nothing yet. Reminders about overdue calls and site visits will appear here.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {notifications.map((n) => {
              const isUnread = !n.read_at;
              return (
                <li key={n.id} className="flex items-start gap-3 py-3">
                  {/* The only thing distinguishing unread, and it survives a
                      colour-blind reader because the weight changes too. */}
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${isUnread ? "bg-navy-700" : "bg-transparent"}`}
                  />

                  <div className="min-w-0 flex-1">
                    <form action={openNotification}>
                      <input type="hidden" name="id" value={n.id} />
                      <input type="hidden" name="href" value={n.href ?? ""} />
                      <button
                        type="submit"
                        disabled={!n.href}
                        className={`text-left text-sm text-ink ${
                          isUnread ? "font-medium" : ""
                        } ${n.href ? "underline-offset-2 hover:underline" : "cursor-default"}`}
                      >
                        {n.body}
                      </button>
                    </form>

                    <p className="mt-0.5 flex items-center gap-2 text-xs text-ink-muted">
                      <span>{formatDateTime(n.sent_at)}</span>
                      {n.status === "failed" && <Badge tone="danger">WhatsApp failed</Badge>}
                    </p>
                  </div>

                  {isUnread && (
                    <form action={dismissNotification}>
                      <input type="hidden" name="id" value={n.id} />
                      <Button size="sm" variant="ghost" type="submit">Mark read</Button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <p className="mt-3 text-xs text-ink-muted">
        Everything appears here. WhatsApp is an extra channel on top, switched on in
        Admin&nbsp;&rarr;&nbsp;Settings once Meta has approved the message wording.
      </p>
    </>
  );
}
