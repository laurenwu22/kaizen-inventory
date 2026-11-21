// Employee management: validation and the "last active admin" rule.
import { z } from "zod";
import { PIN_PATTERN } from "@/lib/auth/pin";
import type { FieldErrors, FormState } from "./validation";

export type MembershipInput = { cafeId: string; role: "EMPLOYEE" | "ADMIN" };
export type EmployeeInput = {
  firstName: string;
  lastName: string;
  pin: string;
  /** Desired memberships, only for cafes the acting admin manages. */
  memberships: MembershipInput[];
};

const name = (label: string) =>
  z.string().trim().min(1, `${label} is required`).max(40, `${label} must be 40 characters or fewer`);

const baseSchema = z.object({
  firstName: name("First name"),
  lastName: name("Last name"),
  pin: z.string().trim().regex(PIN_PATTERN, "PIN must be 3 to 8 digits"),
});

const membershipsSchema = z.array(
  z.object({ cafeId: z.string().min(1).max(64), role: z.enum(["EMPLOYEE", "ADMIN"]) }),
);

/**
 * Validates the employee form. `managedCafeIds` are the cafes the acting admin
 * is an admin at; memberships for any other cafe are rejected.
 */
export function parseEmployeeForm(
  raw: { firstName: string; lastName: string; pin: string; memberships: string },
  managedCafeIds: ReadonlySet<string>,
  { requireAtLeastOne }: { requireAtLeastOne: boolean },
): { data: EmployeeInput; state?: undefined } | { data?: undefined; state: FormState } {
  const fieldErrors: FieldErrors = {};
  const base = baseSchema.safeParse(raw);
  if (!base.success) for (const i of base.error.issues) fieldErrors[String(i.path[0])] ??= i.message;

  let memberships: MembershipInput[] = [];
  try {
    const m = membershipsSchema.safeParse(JSON.parse(raw.memberships || "[]"));
    if (!m.success) fieldErrors.memberships = "Cafes couldn't be read. Try again.";
    else memberships = m.data;
  } catch {
    fieldErrors.memberships = "Cafes couldn't be read. Try again.";
  }
  if (new Set(memberships.map((m) => m.cafeId)).size !== memberships.length) {
    fieldErrors.memberships ??= "A cafe is listed twice.";
  }
  if (memberships.some((m) => !managedCafeIds.has(m.cafeId))) {
    fieldErrors.memberships ??= "You can only assign cafes where you're an admin.";
  }
  if (requireAtLeastOne && memberships.length === 0) {
    fieldErrors.memberships ??= "Pick at least one cafe.";
  }

  if (Object.keys(fieldErrors).length > 0 || !base.success) return { state: { fieldErrors } };
  return { data: { ...base.data, memberships } };
}

/** Thrown inside a transaction to roll it back when a cafe would lose its last active admin. */
export class LastAdminError extends Error {
  constructor(public cafeName: string) {
    super(`${cafeName} needs at least one active admin.`);
  }
}
