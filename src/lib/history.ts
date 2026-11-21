// Order history helpers: month grid math in LA calendar dates. Pure, so it's
// unit tested. Dates are "YYYY-MM-DD", months "YYYY-MM".
import { dateOnly, dateOnlyString } from "./time";

export type DayCell = {
  ymd: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  isFuture: boolean;
};

const DAY = 86_400_000;

export function isMonth(s: string | undefined): s is string {
  return !!s && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function isYmd(s: string | undefined): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export const monthOf = (ymd: string) => ymd.slice(0, 7);

/** "2026-11" + 1 -> "2026-12"; "2026-01" - 1 -> "2025-12". */
export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/** First and last calendar dates of a month. */
export function monthRange(month: string): { first: string; last: string } {
  const first = `${month}-01`;
  const last = dateOnlyString(new Date(dateOnly(`${addMonths(month, 1)}-01`).getTime() - DAY));
  return { first, last };
}

const monthLabelFmt = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" });
/** "2026-11" -> "November 2026" */
export function monthLabel(month: string): string {
  return monthLabelFmt.format(dateOnly(`${month}-01`));
}

/**
 * Weeks (Monday first) covering the month, padded with the neighbouring
 * months' days so every row has 7 cells.
 */
export function monthGrid(month: string, today: string): DayCell[][] {
  const { first, last } = monthRange(month);
  const firstDate = dateOnly(first);
  const offset = (firstDate.getUTCDay() + 6) % 7; // Monday = 0
  const start = firstDate.getTime() - offset * DAY;
  const lastTime = dateOnly(last).getTime();
  const weeks: DayCell[][] = [];
  for (let t = start; t <= lastTime || weeks.at(-1)?.length !== 7; t += DAY) {
    if (!weeks.length || weeks.at(-1)!.length === 7) {
      if (t > lastTime) break;
      weeks.push([]);
    }
    const ymd = dateOnlyString(new Date(t));
    weeks.at(-1)!.push({
      ymd,
      day: Number(ymd.slice(8)),
      inMonth: monthOf(ymd) === month,
      isToday: ymd === today,
      isFuture: ymd > today,
    });
  }
  return weeks;
}

export const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"];
