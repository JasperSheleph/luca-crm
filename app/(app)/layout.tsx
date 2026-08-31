import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/queries/users";
import { getUnreadCount } from "@/lib/queries/notifications";
import { navFor } from "@/lib/navigation";
import Sidebar from "@/components/ui/sidebar";
import MobileNav from "@/components/ui/mobile-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const items = navFor(user.role);
  // One head-only count, on every page, so the badge is never stale after a
  // notification is read on another screen.
  const unreadCount = await getUnreadCount();

  return (
    <div className="min-h-dvh md:flex">
      <Sidebar items={items} user={user} unreadCount={unreadCount} />
      <div className="flex-1 min-w-0">
        {/* pb clears the mobile nav bar */}
        <main className="mx-auto max-w-7xl px-4 py-5 pb-24 md:px-6 md:pb-8">{children}</main>
      </div>
      <MobileNav items={items} unreadCount={unreadCount} />
    </div>
  );
}
