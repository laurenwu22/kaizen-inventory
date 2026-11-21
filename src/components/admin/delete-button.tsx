"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/lib/admin/validation";
import { ui } from "@/components/ui";
import { Spinner } from "@/components/spinner";

/** Two-tap destructive button ("Delete item", "Deactivate", ...) with a confirmation. */
export function DeleteButton({
  action,
  name,
  label,
  verb = "delete",
  confirmLabel = "Yes, delete",
  tone = "danger",
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  /** What's being deleted, e.g. "Bananas". */
  name: string;
  /** Button text, e.g. "Delete item". */
  label: string;
  /** Used in "Are you sure you want to {verb} {name}?" */
  verb?: string;
  confirmLabel?: string;
  /** "danger" (red) for delete/deactivate, "neutral" for reactivate. */
  tone?: "danger" | "neutral";
}) {
  const danger = tone === "danger";
  const [state, formAction, pending] = useActionState(action, {});
  const [armed, setArmed] = useState(false);
  return (
    <form action={formAction} className="flex flex-col items-center text-center">
      {!armed ? (
        <button type="button" onClick={() => setArmed(true)} className={`${ui.secondary} ${danger ? "text-red-700" : ""}`}>
          {label}
        </button>
      ) : (
        <div className={`w-full max-w-sm rounded-2xl p-5 ring-1 ${danger ? "bg-red-50 ring-red-200" : "bg-white ring-ink/15"}`}>
          <p className={`mb-4 font-semibold ${danger ? "text-red-900" : "text-ink"}`}>Are you sure you want to {verb} {name}?</p>
          <div className="flex items-center justify-center gap-2">
            <button
              type="submit"
              disabled={pending}
              className={`inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold text-white disabled:opacity-40 ${
                danger ? "bg-red-700 active:bg-red-800" : "bg-ink active:bg-ink-hover"
              }`}
            >
              {pending ? <Spinner /> : confirmLabel}
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
