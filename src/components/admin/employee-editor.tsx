"use client";

// Employee form (managers only): name, Toast PIN (hidden until shown), whether
// they're a manager, and cafes with a role at each.
import { useActionState, useEffect, useState } from "react";
import type { FormState } from "@/lib/admin/validation";
import { ui } from "@/components/ui";
import { FieldError, FormError, SubmitButton } from "./form-bits";

type Role = "EMPLOYEE" | "ADMIN";

export function EmployeeEditor({
  action,
  managedCafes,
  initial,
  defaultCafeId,
  submitLabel,
  onSaved,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  /** Every cafe (managers can assign any). */
  managedCafes: { id: string; name: string }[];
  initial?: { firstName: string; lastName: string; pin: string; isManager: boolean; memberships: Record<string, Role> };
  /** For new employees: the cafe that starts checked. */
  defaultCafeId?: string;
  submitLabel: string;
  onSaved?: () => void;
}) {
  const [state, formAction] = useActionState(action, {});
  const [showPin, setShowPin] = useState(false);
  const [manager, setManager] = useState(initial?.isManager ?? false);
  const [memberships, setMemberships] = useState<Record<string, Role>>(
    initial?.memberships ?? (defaultCafeId ? { [defaultCafeId]: "EMPLOYEE" } : {}),
  );

  useEffect(() => {
    if (state.savedAt) onSaved?.();
  }, [state.savedAt, onSaved]);

  const toggle = (cafeId: string) =>
    setMemberships((m) => {
      const next = { ...m };
      if (next[cafeId]) delete next[cafeId];
      else next[cafeId] = "EMPLOYEE";
      return next;
    });
  const setRole = (cafeId: string, role: Role) => setMemberships((m) => ({ ...m, [cafeId]: role }));

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <label className={ui.label} htmlFor="emp-first">
            First name
          </label>
          <input id="emp-first" name="firstName" defaultValue={initial?.firstName} className={ui.input} autoComplete="off" />
          <FieldError state={state} name="firstName" />
        </div>
        <div className="min-w-0 flex-1">
          <label className={ui.label} htmlFor="emp-last">
            Last name
          </label>
          <input id="emp-last" name="lastName" defaultValue={initial?.lastName} className={ui.input} autoComplete="off" />
          <FieldError state={state} name="lastName" />
        </div>
      </div>

      <div>
        <label className={ui.label} htmlFor="emp-pin">
          Toast PIN
        </label>
        <div className="flex gap-2">
          <input
            id="emp-pin"
            name="pin"
            type={showPin ? "text" : "password"}
            inputMode="numeric"
            autoComplete="new-password"
            defaultValue={initial?.pin}
            placeholder="3 to 8 digits"
            className={`${ui.input} font-mono tracking-widest`}
          />
          <button type="button" onClick={() => setShowPin((s) => !s)} className={`${ui.secondary} h-12 shrink-0`}>
            {showPin ? "Hide" : "Show"}
          </button>
        </div>
        <FieldError state={state} name="pin" />
      </div>

      <label
        className={`flex cursor-pointer items-start gap-3 rounded-2xl p-3 ring-1 ${
          manager ? "bg-gold/10 ring-gold/40" : "bg-cream/50 ring-ink/10"
        }`}
      >
        <input
          type="checkbox"
          checked={manager}
          onChange={(e) => setManager(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-[#23211e]"
        />
        <span>
          <span className="block font-semibold">Manager</span>
          <span className="block text-sm text-ink/60">
            Manages employees and cafes, and can act as an admin at every cafe.
          </span>
        </span>
      </label>
      <input type="hidden" name="isManager" value={manager ? "true" : "false"} />

      <fieldset>
        <legend className={ui.label}>Cafes{manager ? " (optional for managers)" : ""}</legend>
        <ul className="flex flex-col gap-2">
          {managedCafes.map((c) => {
            const role = memberships[c.id];
            return (
              <li key={c.id} className={`rounded-2xl p-3 ring-1 ${role ? "bg-white ring-ink/20" : "bg-cream/50 ring-ink/10"}`}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={!!role}
                    onChange={() => toggle(c.id)}
                    className="h-5 w-5 shrink-0 accent-[#23211e]"
                  />
                  <span className={`font-semibold ${role ? "" : "text-ink/55"}`}>{c.name}</span>
                </label>
                {role && (
                  <div className="mt-2 flex gap-2 pl-8" role="radiogroup" aria-label={`Role at ${c.name}`}>
                    {(["EMPLOYEE", "ADMIN"] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        role="radio"
                        aria-checked={role === r}
                        onClick={() => setRole(c.id, r)}
                        className={`h-10 flex-1 rounded-full text-sm font-semibold ${
                          role === r ? "bg-ink text-white" : "bg-white text-ink/70 ring-1 ring-ink/20 active:bg-cream"
                        }`}
                      >
                        {r === "ADMIN" ? "Admin" : "Employee"}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <input
          type="hidden"
          name="memberships"
          value={JSON.stringify(Object.entries(memberships).map(([cafeId, role]) => ({ cafeId, role })))}
        />
        <FieldError state={state} name="memberships" />
      </fieldset>

      <FormError state={state} />
      <div className="flex items-center gap-3 border-t border-ink/10 pt-5">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
