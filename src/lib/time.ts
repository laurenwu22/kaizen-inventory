// All dates are calculated and displayed in America/Los_Angeles.
// Timestamps are stored in UTC. Calendar dates (business dates, extra section
// dates, date rules) are stored as Postgres DATE, which Prisma represents as a
// JS Date at UTC midnight. These helpers convert between the two.

export const TIME_ZONE = "America/Los_Angeles";

const ymdFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The LA calendar date of an instant, as "YYYY-MM-DD". */
export function laDateString(instant: Date = new Date()): string {
  return ymdFormatter.format(instant);
}

/** Convert "YYYY-MM-DD" to the Date Prisma uses for a @db.Date column. */
export function dateOnly(ymd: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw new Error(`Invalid date: ${ymd}`);
  const d = new Date(`${ymd}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== ymd) {
    throw new Error(`Invalid date: ${ymd}`);
  }
  return d;
}

/** Convert a @db.Date value from Prisma back to "YYYY-MM-DD". */
export function dateOnlyString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Today's LA business date, ready to store in a @db.Date column. */
export function todayBusinessDate(now: Date = new Date()): Date {
  return dateOnly(laDateString(now));
}

/** Weekday (0-6, Sunday = 0) of a "YYYY-MM-DD" calendar date. */
export function weekdayOf(ymd: string): number {
  return dateOnly(ymd).getUTCDay();
}

const longDate = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** "2027-02-13" -> "Sat, Feb 13, 2027" */
export function formatYmd(ymd: string): string {
  return longDate.format(dateOnly(ymd));
}
