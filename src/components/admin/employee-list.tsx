"use client";

import { useState } from "react";
import Link from "next/link";
import { LinkSpinner } from "@/components/spinner";
import { SearchInput } from "@/components/search-input";
import { ui } from "@/components/ui";
import { PinReveal } from "./pin-reveal";

export type EmployeeRow = {
  id: string;
  name: string;
  pin: string;
  isManager: boolean;
  /** e.g. ["Kaizen Flagship (Admin)", "Luma"] */
  cafes: string[];
  isYou: boolean;
};

/** Searchable list of everyone in the organization (managers only). */
export function EmployeeList({ rows }: { rows: EmployeeRow[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
  return (
    <div className="flex flex-col gap-4">
      {rows.length > 6 && (
        <SearchInput value={query} onChange={setQuery} placeholder="Search by name" label="Search employees by name" />
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
                  {r.isManager && (
                    <span className="shrink-0 rounded-full bg-gold/15 px-2 py-0.5 text-xs font-semibold text-[#6b5830]">Manager</span>
                  )}
                </span>
                <span className="block truncate text-sm text-ink/55">
                  {r.cafes.length ? r.cafes.join(", ") : r.isManager ? "All cafes" : "No cafes"}
                </span>
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
