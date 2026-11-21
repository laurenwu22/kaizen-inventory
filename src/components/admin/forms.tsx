"use client";

// Admin forms. Each takes a (bound) Server Action and shows field errors from it.
import { useActionState, useEffect, useRef } from "react";
import type { FormState } from "@/lib/admin/validation";
import { ui } from "@/components/ui";
import { ColorPicker, DayPicker, FieldError, FormError, SavedNote, SubmitButton } from "./form-bits";
import { DateField } from "./date-field";

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
        <DayPicker defaultValue={defaults?.days} />
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

export function ExtraDateForm({ action, minDate }: { action: Action; minDate: string }) {
  const [state, formAction] = useActionState(action, {});
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={formAction}>
      <label className={ui.label} htmlFor="extra-date">
        Add a one-time date
      </label>
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          {/* Re-mount after a successful add so the field clears */}
          <DateField key={state.savedAt ?? 0} id="extra-date" name="date" min={minDate} label="One-time date" />
        </div>
        <SubmitButton className={`${ui.secondary} h-12 shrink-0`}>Add</SubmitButton>
      </div>
      <FieldError state={state} name="date" />
    </form>
  );
}
