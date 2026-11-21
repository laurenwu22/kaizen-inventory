"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormState } from "@/lib/admin/validation";
import { ui } from "@/components/ui";
import { ItemEditor } from "./item-editor";

/** "+ Add item" button that opens the item editor in a pop-up. */
export function AddItemModal({
  action,
  units,
  today,
  sectionName,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  units: string[];
  today: string;
  sectionName: string;
}) {
  const [open, setOpen] = useState(false);
  // Bumped on every open so the editor starts empty each time.
  const [session, setSession] = useState(0);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        type="button"
        className={ui.secondary}
        onClick={() => {
          setSession((n) => n + 1);
          setOpen(true);
        }}
      >
        + Add item
      </button>
      <dialog
        ref={ref}
        onClose={close}
        aria-labelledby="add-item-title"
        className="m-auto mb-0 max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-0 text-ink shadow-xl backdrop:bg-ink/40 sm:mb-auto sm:rounded-3xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-ink/10 bg-white px-5 py-3">
          <div>
            <h2 id="add-item-title" className="text-lg font-bold">
              Add item
            </h2>
            <p className="text-sm text-ink/55">{sectionName}</p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-full text-ink/60 active:bg-cream"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {open && (
            <ItemEditor
              key={session}
              action={action}
              units={units}
              today={today}
              submitLabel="Save item"
              onSaved={close}
            />
          )}
        </div>
      </dialog>
    </>
  );
}
