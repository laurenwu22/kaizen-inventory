"use client";

import { useState } from "react";
import Link from "next/link";
import type { ItemHistory } from "@/lib/history-data";
import { formatQty } from "@/lib/quantity";
import { formatYmd } from "@/lib/time";
import { LinkSpinner } from "@/components/spinner";
import { ui } from "@/components/ui";
import { SearchInput } from "@/components/search-input";

const href = (ymd: string) => `/history?month=${ymd.slice(0, 7)}&date=${ymd}`;

/** Search item names as you type; each result shows last ordered and last counted. */
export function ItemSearch({ items }: { items: ItemHistory[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const results = q ? items.filter((i) => i.name.toLowerCase().includes(q)).slice(0, 20) : [];

  return (
    <div className="flex flex-col gap-4">
      <SearchInput value={query} onChange={setQuery} placeholder="Search items" label="Search item history" />
      {q && (
        <ul className={`${ui.card} divide-y divide-ink/10`}>
          {results.length === 0 && <li className="px-4 py-3 text-sm text-ink/55">No items match “{query}”.</li>}
          {results.map((i) => {
            const target = i.lastOrdered?.date ?? i.lastCounted?.date;
            const body = (
              <>
                <span className="flex items-center gap-2">
                  <span className="truncate font-semibold">{i.name}</span>
                  {i.inactive && <span className="rounded-full bg-cream px-2 py-0.5 text-xs font-semibold text-ink/55">Inactive</span>}
                  <span className="ml-auto shrink-0 text-xs text-ink/45">{i.section}</span>
                </span>
                <span className="mt-1 block text-sm text-ink/70">
                  <span className="font-medium text-ink/55">Last ordered: </span>
                  {i.lastOrdered
                    ? `${formatYmd(i.lastOrdered.date)} · ${formatQty(i.lastOrdered.amount)} ${i.unit} · ${i.lastOrdered.by}`
                    : "Not ordered yet"}
                </span>
                <span className="block text-sm text-ink/70">
                  <span className="font-medium text-ink/55">Last counted: </span>
                  {i.lastCounted
                    ? `${formatYmd(i.lastCounted.date)} · ${i.lastCounted.by}${i.lastCounted.plenty ? " · Plenty" : ""}`
                    : "Never counted"}
                </span>
              </>
            );
            return (
              <li key={i.id}>
                {target ? (
                  <Link href={href(target)} scroll={false} onClick={() => setQuery("")} className="flex items-center gap-3 px-4 py-3 active:bg-cream">
                    <span className="min-w-0 flex-1">{body}</span>
                    <LinkSpinner />
                  </Link>
                ) : (
                  <div className="px-4 py-3">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
