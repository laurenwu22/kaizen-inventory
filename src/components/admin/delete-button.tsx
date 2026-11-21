"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/lib/admin/validation";
import { ui } from "@/components/ui";
import { Spinner } from "@/components/spinner";

/** Two-tap "Delete item" / "Delete section" that permanently removes it. */
export function DeleteButton({
  action,
  name,
  label,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  /** What's being deleted, e.g. "Bananas". */
  name: string;
  /** Button text, e.g. "Delete item". */
  label: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [armed, setArmed] = useState(false);
  return (
    <form action={formAction} className="flex flex-col items-center text-center">
      {!armed ? (
        <button type="button" onClick={() => setArmed(true)} className={`${ui.secondary} text-red-700`}>
          {label}
        </button>
      ) : (
        <div className="w-full max-w-sm rounded-2xl bg-red-50 p-5 ring-1 ring-red-200">
          <p className="mb-4 font-semibold text-red-900">Are you sure you want to delete {name}?</p>
          <div className="flex items-center justify-center gap-2">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-11 items-center justify-center rounded-full bg-red-700 px-5 text-sm font-semibold text-white active:bg-red-800 disabled:opacity-40"
            >
              {pending ? <Spinner /> : "Yes, delete"}
            </button>
            <button type="button" onClick={() => setArmed(false)} className="h-11 px-3 text-sm font-semibold text-ink/60">
              Cancel
            </button>
          </div>
        </div>
      )}
      {state.error && <p className={ui.error}>{state.error}</p>}
    </form>
  );
}
