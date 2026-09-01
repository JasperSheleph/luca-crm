import Image from "next/image";
import Link from "next/link";
import { signOut } from "@/lib/actions/auth";
import type { NavItem } from "@/lib/navigation";
import type { AppUser } from "@/lib/types";
import NavLink from "./nav-link";
import { ROLE_LABELS } from "@/lib/domain/permissions";

export default function Sidebar({
  items, user, unreadCount = 0,
}: {
  items: NavItem[];
  user: AppUser;
  unreadCount?: number;
}) {
  return (
    /* Sticky and exactly one screen tall, so who-you-are and Sign out are
       always on screen. Without it the column is only as tall as the page and
       the footer scrolls away with the content — on a long deal list it ended
       up thousands of pixels down. The nav scrolls inside instead. */
    <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col bg-navy-900 md:flex">
      <div className="px-4 py-5">
        <Link href="/">
          <Image
            src="/luca-logo-white.png" alt="LUCA Elevators"
            width={200} height={52} priority
            className="h-auto w-[150px]"
          />
        </Link>
      </div>

      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2">
        {items.map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            label={item.label}
            badge={item.href === "/notifications" ? unreadCount : 0}
          />
        ))}
      </nav>

      <div className="shrink-0 border-t border-white/10 p-3">
        <p className="truncate text-sm font-medium text-white">{user.name}</p>
        <p className="mb-2 text-xs text-white/60">{ROLE_LABELS[user.role]}</p>
        <form action={signOut}>
          <button type="submit" className="text-xs text-white/70 underline-offset-2 hover:text-white hover:underline">
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
