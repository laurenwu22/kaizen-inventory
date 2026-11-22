// The printable count sheet (Create PDF): the same sections, items and min/max
// the counting screen shows for a date, so paper and app always agree.
import { buildCountSheet, type CountSection, type SectionInput } from "./inventory";

export type PrintScope = "scheduled" | "all";

export const parseScope = (v: unknown): PrintScope => (v === "all" ? "all" : "scheduled");

/** Sections to print for a date: those scheduled that day, or every section. */
export function buildPrintSheet(sections: SectionInput[], ymd: string, scope: PrintScope): CountSection[] {
  const sheet = buildCountSheet(sections, ymd);
  return scope === "all" ? sheet : sheet.filter((s) => s.scheduled);
}
