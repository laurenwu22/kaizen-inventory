// Quantity rules and section scheduling. Pure functions shared by the admin
// screens (week-at-a-glance) and employee counting, so both always agree.
//
// Resolution order for a day: DATE rule, then WEEKDAY rule, then DEFAULT.
// Dates are LA calendar dates as "YYYY-MM-DD"; weekdays are 0-6, Sunday = 0.
import { weekdayOf } from "./time";

export type RuleType = "DEFAULT" | "WEEKDAY" | "DATE";

export type Rule = {
  id?: string;
  type: RuleType;
  weekday: number | null;
  /** "YYYY-MM-DD" for DATE rules, otherwise null. */
  date: string | null;
  min: number;
  max: number;
};

export type Resolved = { min: number; max: number; source: RuleType };

/** The min/max that applies to an item on a calendar date, or null if it has no default. */
export function resolveQuantity(rules: Rule[], ymd: string): Resolved | null {
  const dateRule = rules.find((r) => r.type === "DATE" && r.date === ymd);
  if (dateRule) return { min: dateRule.min, max: dateRule.max, source: "DATE" };
  return resolveForWeekday(rules, weekdayOf(ymd));
}

/** Weekday rule, else default, ignoring one-time dates. Used for the weekly grid. */
export function resolveForWeekday(rules: Rule[], weekday: number): Resolved | null {
  const weekdayRule = rules.find((r) => r.type === "WEEKDAY" && r.weekday === weekday);
  if (weekdayRule) return { min: weekdayRule.min, max: weekdayRule.max, source: "WEEKDAY" };
  const def = rules.find((r) => r.type === "DEFAULT");
  return def ? { min: def.min, max: def.max, source: "DEFAULT" } : null;
}

/** A section is counted on a date if its weekday is selected or the date is an extra date. */
export function isSectionScheduled(
  section: { daysOfWeek: number[]; extraDates: string[] },
  ymd: string,
): boolean {
  return section.daysOfWeek.includes(weekdayOf(ymd)) || section.extraDates.includes(ymd);
}

/** Display order for weekdays: Monday first, as cafes plan their week. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const WEEKDAY_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** 2 -> "2", 0.5 -> "0.5", 2.25 -> "2.25". */
export function formatQty(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

/** Human summary of which days a section runs, e.g. "Every day", "Mon, Wed, Fri". */
export function describeDays(days: number[]): string {
  const set = new Set(days);
  if (set.size === 7) return "Every day";
  if (set.size === 0) return "No regular days";
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return "Weekdays";
  if (set.size === 2 && set.has(0) && set.has(6)) return "Weekends";
  return WEEK_ORDER.filter((d) => set.has(d))
    .map((d) => WEEKDAY_SHORT[d])
    .join(", ");
}
