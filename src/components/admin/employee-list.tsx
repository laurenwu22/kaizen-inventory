"use client";

import { useState } from "react";
import Link from "next/link";
import { LinkSpinner } from "@/components/spinner";
import { ui } from "@/components/ui";
import { PinReveal } from "./pin-reveal";

export type EmployeeRow = {
  id: string;
  name: string;
  pin: string;
  role: "EMPLOYEE" | "ADMIN";
  otherCafes: string[];
  isYou: boolean;
};

/** Searchable list of active employees at the cafe. */
export function EmployeeList({ rows }: { rows: EmployeeRow[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
  return (
    <div className="flex flex-col gap-3">
      {rows.length > 6 && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name"
          aria-label="Search employees by name"
          className={ui.input}
        />
      )}
      <ul className={`${ui.card} divide-y divide-ink/10`}>
        {shown.length === 0 && <li className="px-4 py-3 text-ink/60">No one matches “{query}”.</li>}
        {shown.map((r) => (
          <li key={r.id}>
            <Link href={`/admin/employees/${r.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-cream">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-semibold">{r.name}</span>
                  {r.isYou && <span className="text-sm text-ink/50">(you)</span>}
                  {r.role === "ADMIN" && (
                    <span className="rounded-full bg-gold/15 px-2 py-0.5 text-xs font-semibold text-[#6b5830]">Admin</span>
                  )}
                </span>
                {r.otherCafes.length > 0 && (
                  <span className="block truncate text-sm text-ink/55">Also at {r.otherCafes.join(", ")}</span>
                )}
              </span>
              <PinReveal pin={r.pin} className="shrink-0 text-sm text-ink/70" />
              <LinkSpinner />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
