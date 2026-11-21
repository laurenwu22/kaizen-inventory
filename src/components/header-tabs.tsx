"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LinkSpinner } from "./spinner";

/** Inventory | Admin tabs (admins only). Highlights the current area. */
export function HeaderTabs() {
  const pathname = usePathname();
  const inAdmin = pathname.startsWith("/admin");
  return (
    <nav className="flex gap-2">
      <Tab href="/inventory" selected={!inAdmin}>
        Inventory
      </Tab>
      <Tab href="/admin" selected={inAdmin}>
        Admin
      </Tab>
    </nav>
  );
}

function Tab({ href, selected, children }: { href: string; selected: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={selected ? "page" : undefined}
      className={`flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold ${
        selected ? "bg-ink text-white" : "bg-paper/60 text-ink/80 ring-1 ring-ink/15 active:bg-cream"
      }`}
    >
      {children}
      <LinkSpinner className={selected ? "text-white" : ""} />
    </Link>
  );
}
