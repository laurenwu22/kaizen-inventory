"use client";

// Admin forms. Each takes a (bound) Server Action and shows field errors from it.
import { useActionState, useEffect, useRef } from "react";
import type { FormState } from "@/lib/admin/validation";
import { ui } from "@/components/ui";
import {
  ColorPicker,
  DayPicker,
  FieldError,
  FormError,
  QtyInput,
  SavedNote,
  SubmitButton,
} from "./form-bits";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

/** Clears a form after a successful submit (for "add" forms). */
function useResetOnSuccess(state: FormState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return ref;
}

export function SectionForm({
  action,
  defaults,
  submitLabel,
}: {
  action: Action;
  defaults?: { name: string; color: string; days: number[] };
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div>
        <label className={ui.label} htmlFor="name">
          Section name
        </label>
        <input
          id="name"
          name="name"
          defaultValue={defaults?.name}
          placeholder="e.g. Perishables"
          className={ui.input}
          autoComplete="off"
        />
        <FieldError state={state} name="name" />
      </div>
      <div>
        <span className={ui.label}>Color</span>
        <ColorPicker defaultValue={defaults?.color} />
        <FieldError state={state} name="color" />
      </div>
      <div>
        <span className={ui.label}>Days this section is counted</span>
        <DayPicker defaultValue={defaults?.days} shortcuts />
        <FieldError state={state} name="days" />
      </div>
      <FormError state={state} />
      <div className="flex items-center gap-3">
        <SubmitButton>{submitLabel}</SubmitButton>
        <SavedNote state={state} />
      </div>
    </form>
  );
}

export function ItemForm({
  action,
  defaults,
  units,
  submitLabel,
}: {
  action: Action;
  defaults?: { name: string; unit: string; min: string; max: string };
  units: string[];
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div>
        <label className={ui.label} htmlFor="name">
          Item name
        </label>
        <input
          id="name"
          name="name"
          defaultValue={defaults?.name}
          placeholder="e.g. Bananas"
          className={ui.input}
          autoComplete="off"
        />
        <FieldError state={state} name="name" />
      </div>
      <div>
        <label className={ui.label} htmlFor="unit">
          Unit
        </label>
        <input
          id="unit"
          name="unit"
          list="unit-suggestions"
          defaultValue={defaults?.unit}
          placeholder="e.g. bunch"
          className={ui.input}
          autoComplete="off"
        />
        <datalist id="unit-suggestions">
          {units.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
        <FieldError state={state} name="unit" />
      </div>
      <fieldset>
        <legend className={ui.label}>Default amounts (every day unless overridden)</legend>
        <div className="flex gap-3">
          <QtyInput name="min" label="Min" defaultValue={defaults?.min} state={state} />
          <QtyInput name="max" label="Max" defaultValue={defaults?.max} state={state} />
        </div>
      </fieldset>
      <FormError state={state} />
      <div className="flex items-center gap-3">
        <SubmitButton>{submitLabel}</SubmitButton>
        <SavedNote state={state} />
      </div>
    </form>
  );
}

export function WeekdayOverrideForm({ action, unit }: { action: Action; unit: string }) {
  const [state, formAction] = useActionState(action, {});
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={formAction} className="flex flex-col gap-4">
      <div>
        <span className={ui.label}>Days</span>
        {/* Re-mount after a successful save so the chips clear */}
        <DayPicker key={state.savedAt ?? 0} />
        <FieldError state={state} name="days" />
      </div>
      <div className="flex gap-3">
        <QtyInput name="min" label={`Min (${unit})`} state={state} />
        <QtyInput name="max" label={`Max (${unit})`} state={state} />
      </div>
      <FormError state={state} />
      <div className="flex items-center gap-3">
        <SubmitButton className={ui.secondary}>Apply to selected days</SubmitButton>
        <SavedNote state={state} />
      </div>
    </form>
  );
}

export function DateRuleForm({ action, unit, minDate }: { action: Action; unit: string; minDate: string }) {
  const [state, formAction] = useActionState(action, {});
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={formAction} className="flex flex-col gap-4">
      <div>
        <label className={ui.label} htmlFor="rule-date">
          Date
        </label>
        <input id="rule-date" name="date" type="date" min={minDate} className={ui.input} />
        <FieldError state={state} name="date" />
      </div>
      <div className="flex gap-3">
        <QtyInput name="min" label={`Min (${unit})`} state={state} />
        <QtyInput name="max" label={`Max (${unit})`} state={state} />
      </div>
      <FormError state={state} />
      <div className="flex items-center gap-3">
        <SubmitButton className={ui.secondary}>Add date</SubmitButton>
        <SavedNote state={state} />
      </div>
    </form>
  );
}

export function ExtraDateForm({ action, minDate }: { action: Action; minDate: string }) {
  const [state, formAction] = useActionState(action, {});
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={formAction}>
      <label className={ui.label} htmlFor="extra-date">
        Add a one-time date
      </label>
      <div className="flex gap-2">
        <input id="extra-date" name="date" type="date" min={minDate} className={ui.input} />
        <SubmitButton className={`${ui.secondary} h-12 shrink-0`}>Add</SubmitButton>
      </div>
      <FieldError state={state} name="date" />
    </form>
  );
}
