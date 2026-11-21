// Counting and order math shared by the employee screen and the server.
// Amounts are handled in hundredths (integers) so 0.5 + 0.1 style float errors
// can't creep into order quantities.

/** "2", "0.5", "1.25", ".5" -> number; "", "-1", "1.234", "abc" -> null. */
export function parseQty(raw: string): number | null {
  const s = raw.trim();
  if (!/^\d+(\.\d{1,2})?$|^\.\d{1,2}$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n <= 99999 ? n : null;
}

const cents = (n: number) => Math.round(n * 100);
const fromCents = (c: number) => c / 100;

/**
 * SPEC: if current stock is at or below the minimum, order max - current;
 * otherwise order nothing.
 */
export function computeAutoOrder(current: number, min: number, max: number): number {
  const c = cents(current);
  if (c > cents(min)) return 0;
  return fromCents(Math.max(0, cents(max) - c));
}

/** Current stock after a − / + tap: steps of 0.5, never below 0. */
export function stepCount(raw: string, direction: 1 | -1): string {
  const current = parseQty(raw);
  if (current === null) return direction === 1 ? "0.5" : "0";
  const next = Math.max(0, fromCents(cents(current) + direction * 50));
  return String(next);
}
