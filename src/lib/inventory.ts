// Builds what the employee counting screen shows for a given LA date.
// Pure (no database), so it can be unit tested.
import { byPosition, isSectionScheduled, resolveQuantity, type Rule } from "./quantity";

export type CountItem = {
  id: string;
  name: string;
  unit: string;
  /** Today's min/max after date -> weekday -> default resolution. */
  min: number;
  max: number;
};

export type CountSection = {
  id: string;
  name: string;
  color: string;
  /** Scheduled for this date (weekday or extra date). Others can be added on the fly. */
  scheduled: boolean;
  /** Every item in the section has been counted in a submission today. */
  submittedToday: boolean;
  items: CountItem[];
};

export type SectionInput = {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  active: boolean;
  daysOfWeek: number[];
  extraDates: string[];
  items: { id: string; name: string; unit: string; sortOrder: number; active: boolean; rules: Rule[] }[];
};

/**
 * Active sections with their active items, in admin order, each item with
 * today's min/max. Items without any applicable amounts and sections with no
 * countable items are left out.
 */
export function buildCountSheet(
  sections: SectionInput[],
  ymd: string,
  countedToday: ReadonlySet<string> = new Set(),
): CountSection[] {
  return sections
    .filter((s) => s.active)
    .sort(byPosition)
    .map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      scheduled: isSectionScheduled(s, ymd),
      submittedToday: false,
      items: s.items
        .filter((i) => i.active)
        .sort(byPosition)
        .flatMap((i) => {
          const q = resolveQuantity(i.rules, ymd);
          return q ? [{ id: i.id, name: i.name, unit: i.unit, min: q.min, max: q.max }] : [];
        }),
    }))
    .filter((s) => s.items.length > 0)
    .map((s) => ({ ...s, submittedToday: s.items.every((i) => countedToday.has(i.id)) }));
}
