// Pre-filling the counting screen from today's submissions. Pure helpers for
// deciding what's on screen and what counts as a change worth submitting.
import type { SubmittedEntry } from "./combined-data-types";
import { parseOrder, parseQty } from "./order";
import { formatQty } from "./quantity";

/** One item's entry as shown on screen. */
export type Entry = { count: string; order: string; edited: boolean; plenty: boolean };
export const BLANK: Entry = { count: "", order: "", edited: false, plenty: false };

export function baselineEntry(b: SubmittedEntry | undefined): Entry {
  if (!b) return BLANK;
  return {
    count: b.count === null ? "" : formatQty(b.count),
    order: formatQty(b.finalOrder),
    edited: b.manuallyEdited,
    plenty: b.plenty,
  };
}

export const isBlank = (e: Entry) => !e.plenty && !e.count.trim();

export function sameEntry(a: Entry, b: Entry): boolean {
  if (a.plenty !== b.plenty) return false;
  if (a.plenty) return true;
  const ca = a.count.trim() ? parseQty(a.count) : null;
  const cb = b.count.trim() ? parseQty(b.count) : null;
  if (ca !== cb || (ca === null && a.count.trim() !== b.count.trim())) return false;
  if (a.edited !== b.edited) return false;
  return !a.edited || parseOrder(a.order) === parseOrder(b.order);
}
