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

export const weekdayRuleSchema = z
  .object({ days: z.array(weekday).min(1, "Pick at least one day").transform((d) => [...new Set(d)]) })
  .and(minMax);

export const dateRuleSchema = z.object({ date: ymd }).and(minMax);

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
