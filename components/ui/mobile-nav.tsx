"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/lib/navigation";

/** The owners work on phones and reps live on them. */
export default function MobileNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const shown = items.filter((i) => i.mobile);
  if (shown.length === 0) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-paper md:hidden">
      {shown.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex-1 px-2 py-3 text-center text-xs ${
              active ? "font-semibold text-navy-900" : "text-ink-muted"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
