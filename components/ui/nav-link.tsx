"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavLink({
  href, label, badge = 0,
}: {
  href: string;
  label: string;
  /** Unread count. Zero renders nothing at all, not a "0". */
  badge?: number;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`block rounded-md px-3 py-2 text-sm transition-colors ${
        active ? "bg-white/15 font-medium text-white" : "text-white/75 hover:bg-white/10 hover:text-white"
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        {label}
        {badge > 0 && (
          <span
            className="rounded-full bg-gold px-1.5 py-0.5 text-[10px] font-semibold leading-none text-navy-900"
            aria-label={`${badge} unread`}
          >
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </span>
    </Link>
  );
}
