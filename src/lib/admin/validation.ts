// Server-side validation for admin forms. Shared types are also used by the
// client forms to show field errors.
import { z } from "zod";

/** Section colors (calendar dots). Chosen to sit well on the sand background. */
export const SECTION_COLORS = [
  { name: "Gold", value: "#b09458" },
  { name: "Sage", value: "#6b8f71" },
  { name: "Clay", value: "#b8694a" },
  { name: "Ocean", value: "#4f7896" },
  { name: "Plum", value: "#85607e" },
  { name: "Olive", value: "#8a8a3d" },
  { name: "Rose", value: "#c27c88" },
  { name: "Slate", value: "#5b6670" },
  { name: "Teal", value: "#3f8a86" },
  { name: "Sky", value: "#6aa3c8" },
  { name: "Lavender", value: "#9a88c2" },
  { name: "Berry", value: "#a63d63" },
  { name: "Mustard", value: "#d2a32a" },
  { name: "Coral", value: "#e2795e" },
] as const;

const colorValues = SECTION_COLORS.map((c) => c.value) as [string, ...string[]];

export const MAX_QTY = 99999;

const name = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be ${max} characters or fewer`);

/** Quantity from a form field: non-negative, at most 2 decimal places. */
const qty = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .refine((s) => /^\d+(\.\d{1,2})?$|^\.\d{1,2}$/.test(s), `${label} must be a number like 2 or 0.5`)
    .transform(Number)
    .refine((n) => n <= MAX_QTY, `${label} is too large`);

const minMax = z
  .object({ min: qty("Min"), max: qty("Max") })
  .refine((v) => v.min <= v.max, { message: "Min can't be more than max", path: ["max"] });

const weekday = z.coerce.number().int().min(0).max(6);

const ymd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date")
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Pick a valid date");

export const sectionSchema = z.object({
  name: name("Section name", 60),
  color: z.enum(colorValues, { message: "Pick a color" }),
  days: z.array(weekday).transform((d) => [...new Set(d)].sort()),
});

export const itemSchema = z
  .object({
    name: name("Item name", 80),
    unit: name("Unit", 30),
  })
  .and(minMax);

export const extraDateSchema = z.object({ date: ymd });

export type FieldErrors = Partial<Record<string, string>>;
export type FormState = {
  error?: string;
  fieldErrors?: FieldErrors;
  ok?: boolean;
  /** Changes on every successful save; used to reset "add" forms. */
  savedAt?: number;
};

export const saved = (): FormState => ({ ok: true, savedAt: Date.now() });

/** Parse a form with a schema; returns data or a FormState with per-field messages. */
export function parseForm<T>(
  schema: z.ZodType<T>,
  input: unknown,
): { data: T; state?: undefined } | { data?: undefined; state: FormState } {
  const result = schema.safeParse(input);
  if (result.success) return { data: result.data };
  const fieldErrors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "form");
    fieldErrors[key] ??= issue.message;
  }
  return { state: { fieldErrors } };
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type AmountInput = { min: string; max: string };
export type WeekdayAmount = { day: number; min: number; max: number };
export type DateAmount = { date: string; min: number; max: number };
export type ItemInput = {
  name: string;
  unit: string;
  min: number;
  max: number;
  weekdays: WeekdayAmount[];
  dates: DateAmount[];
};

const weekdayEntry = z.object({ day: z.number().int().min(0).max(6), min: z.string(), max: z.string() });
const dateEntry = z.object({ date: z.string(), min: z.string(), max: z.string() });

function parseJsonArray<T>(raw: string, schema: z.ZodType<T>): T[] | null {
  try {
    const value = raw ? JSON.parse(raw) : [];
    const result = z.array(schema).safeParse(value);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * Validates the whole item editor: details, default amounts, custom weekday
 * amounts and one-time dates (sent as JSON in "weekdays" and "dates").
 * One-time dates must be today or later (LA date passed in as `today`).
 */
export function parseItemForm(
  raw: { name: string; unit: string; min: string; max: string; weekdays: string; dates: string },
  today: string,
): { data: ItemInput; state?: undefined } | { data?: undefined; state: FormState } {
  const fieldErrors: FieldErrors = {};
  const base = parseForm(itemSchema, { name: raw.name, unit: raw.unit, min: raw.min, max: raw.max });
  if (base.state) Object.assign(fieldErrors, base.state.fieldErrors);

  const weekdays: WeekdayAmount[] = [];
  const weekdayRows = parseJsonArray(raw.weekdays, weekdayEntry);
  if (!weekdayRows) fieldErrors.weekdays = "Custom daily amounts couldn't be read. Try again.";
  for (const row of weekdayRows ?? []) {
    const label = WEEKDAY_NAMES[row.day];
    if (weekdays.some((w) => w.day === row.day)) {
      fieldErrors.weekdays ??= `${label} is listed twice`;
      continue;
    }
    const amounts = minMax.safeParse({ min: row.min, max: row.max });
    if (!amounts.success) {
      fieldErrors.weekdays ??= `${label}: ${amounts.error.issues[0].message}`;
      continue;
    }
    weekdays.push({ day: row.day, ...amounts.data });
  }

  const dates: DateAmount[] = [];
  const dateRows = parseJsonArray(raw.dates, dateEntry);
  if (!dateRows) fieldErrors.dates = "One-time dates couldn't be read. Try again.";
  for (const row of dateRows ?? []) {
    const date = ymd.safeParse(row.date);
    if (!date.success) {
      fieldErrors.dates ??= date.error.issues[0].message;
      continue;
    }
    if (date.data < today) {
      fieldErrors.dates ??= `${date.data} is in the past`;
      continue;
    }
    if (dates.some((d) => d.date === date.data)) {
      fieldErrors.dates ??= `${date.data} is listed twice`;
      continue;
    }
    const amounts = minMax.safeParse({ min: row.min, max: row.max });
    if (!amounts.success) {
      fieldErrors.dates ??= `${date.data}: ${amounts.error.issues[0].message}`;
      continue;
    }
    dates.push({ date: date.data, ...amounts.data });
  }

  if (Object.keys(fieldErrors).length > 0 || !base.data) return { state: { fieldErrors } };
  return { data: { ...base.data, weekdays, dates } };
}

/** Client-side check for a min/max pair before applying it locally. */
export function checkAmounts(a: AmountInput): string | null {
  const r = minMax.safeParse(a);
  return r.success ? null : r.error.issues[0].message;
}
