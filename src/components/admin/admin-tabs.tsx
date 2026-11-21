"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LinkSpinner } from "@/components/spinner";

type Tab = "sections" | "employees" | null;

/** Sections | Employees sub-tabs inside Admin. */
export function AdminTabs() {
  // The URL is request-time data on dynamic pages, so read it inside Suspense;
  // the fallback draws the same tabs without a highlight for that instant.
  return (
    <Suspense fallback={<TabsView tab={null} />}>
      <CurrentTabs />
    </Suspense>
  );
}

function CurrentTabs() {
  const pathname = usePathname();
  return <TabsView tab={pathname.startsWith("/admin/employees") ? "employees" : "sections"} />;
}

function TabsView({ tab }: { tab: Tab }) {
  return (
    <nav className="flex gap-6 border-b border-ink/10" aria-label="Admin">
      <SubTab href="/admin" selected={tab === "sections"}>
        Sections
      </SubTab>
      <SubTab href="/admin/employees" selected={tab === "employees"}>
        Employees
      </SubTab>
    </nav>
  );
}

function SubTab({ href, selected, children }: { href: string; selected: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={selected ? "page" : undefined}
      className={`-mb-px flex h-11 items-center gap-2 border-b-2 font-semibold ${
        selected ? "border-gold text-ink" : "border-transparent text-ink/55"
      }`}
    >
      {children}
      <LinkSpinner />
    </Link>
  );
}
