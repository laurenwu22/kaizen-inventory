"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { SECTION_COLORS, type FormState } from "@/lib/admin/validation";
import { WEEK_ORDER, WEEKDAY_SHORT } from "@/lib/quantity";
import { ui } from "@/components/ui";

export function FieldError({ state, name }: { state: FormState; name: string }) {
  const msg = state.fieldErrors?.[name];
  return msg ? <p className={ui.error}>{msg}</p> : null;
}

export function FormError({ state }: { state: FormState }) {
  const msg = state.error ?? state.fieldErrors?.form;
  return msg ? <p className={ui.error}>{msg}</p> : null;
}

export function SubmitButton({
  children,
  className = ui.primary,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? "Saving…" : children}
    </button>
  );
}

/** Saved confirmation that fades in after a successful save. */
export function SavedNote({ state }: { state: FormState }) {
  return state.ok ? <span className="text-sm font-medium text-ink/60">Saved</span> : null;
}

/** Text input for quantities: decimal keyboard on phones, accepts 0.5 etc. */
export function QtyInput({
  name,
  label,
  defaultValue,
  state,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  state: FormState;
}) {
  return (
    <div className="min-w-0 flex-1">
      <label className={ui.label} htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        defaultValue={defaultValue}
        placeholder="0"
        className={ui.input}
      />
      <FieldError state={state} name={name} />
    </div>
  );
}

/** Seven tap-to-toggle day chips, Monday first. Submits as repeated "days" fields. */
export function DayPicker({ defaultValue = [], name = "days" }: { defaultValue?: number[]; name?: string }) {
  const [selected, setSelected] = useState<Set<number>>(new Set(defaultValue));
  const toggle = (d: number) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });

  return (
    <div>
      <div className="flex gap-1.5" role="group">
        {WEEK_ORDER.map((d) => {
          const on = selected.has(d);
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(d)}
              className={`h-11 min-w-0 flex-1 rounded-full text-sm font-semibold ${
                on ? "bg-ink text-white" : "bg-white text-ink/70 ring-1 ring-ink/20 active:bg-cream"
              }`}
            >
              {WEEKDAY_SHORT[d]}
            </button>
          );
        })}
      </div>
      {[...selected].map((d) => (
        <input key={d} type="hidden" name={name} value={d} />
      ))}
    </div>
  );
}

export function ColorPicker({ defaultValue }: { defaultValue?: string }) {
  const initial = SECTION_COLORS.some((c) => c.value === defaultValue) ? defaultValue : SECTION_COLORS[0].value;
  return (
    <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Section color">
      {SECTION_COLORS.map((c) => (
        <label key={c.value} className="relative cursor-pointer" title={c.name}>
          <input
            type="radio"
            name="color"
            value={c.value}
            defaultChecked={c.value === initial}
            className="peer sr-only"
          />
          <span className="sr-only">{c.name}</span>
          <span
            className="block h-10 w-10 rounded-full ring-2 ring-transparent ring-offset-2 ring-offset-white peer-checked:ring-ink peer-focus-visible:ring-gold"
            style={{ backgroundColor: c.value }}
          />
        </label>
      ))}
    </div>
  );
}

/** A button that needs a second tap to confirm (for deactivating). */
export function ConfirmSubmit({
  label,
  confirmLabel,
  className,
}: {
  label: string;
  confirmLabel: string;
  className: string;
}) {
  const [armed, setArmed] = useState(false);
  const { pending } = useFormStatus();
  if (!armed) {
    return (
      <button type="button" className={className} onClick={() => setArmed(true)}>
        {label}
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 items-center justify-center rounded-full bg-red-700 px-4 text-sm font-semibold text-white active:bg-red-800 disabled:opacity-40"
      >
        {confirmLabel}
      </button>
      <button type="button" className="h-11 px-3 text-sm text-ink/60" onClick={() => setArmed(false)}>
        Cancel
      </button>
    </span>
  );
}
