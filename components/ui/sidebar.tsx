import Image from "next/image";
import Link from "next/link";
import { signOut } from "@/lib/actions/auth";
import type { NavItem } from "@/lib/navigation";
import type { AppUser } from "@/lib/types";
import NavLink from "./nav-link";

const ROLE_LABEL: Record<AppUser["role"], string> = {
  admin: "Admin",
  crm_manager: "CRM Manager",
  sales_rep: "Sales Rep",
};

export default function Sidebar({
  items, user, unreadCount = 0,
}: {
  items: NavItem[];
  user: AppUser;
  unreadCount?: number;
}) {
  return (
    <aside className="hidden w-56 shrink-0 flex-col bg-navy-900 md:flex">
      <div className="px-4 py-5">
        <Link href="/">
          <Image
            src="/luca-logo-white.png" alt="LUCA Elevators"
            width={200} height={52} priority
            className="h-auto w-[150px]"
          />
        </Link>
      </div>

      <nav className="flex-1 space-y-0.5 px-2">
        {items.map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            label={item.label}
            badge={item.href === "/notifications" ? unreadCount : 0}
          />
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <p className="truncate text-sm font-medium text-white">{user.name}</p>
        <p className="mb-2 text-xs text-white/60">{ROLE_LABEL[user.role]}</p>
        <form action={signOut}>
          <button type="submit" className="text-xs text-white/70 underline-offset-2 hover:text-white hover:underline">
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
