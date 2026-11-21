"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ui } from "@/components/ui";

/**
 * A button that opens a bottom-sheet pop-up. The content is re-created each
 * time it opens (so forms start empty) and gets a `close` function.
 */
export function ModalButton({
  label,
  title,
  subtitle,
  buttonClassName = ui.secondary,
  children,
}: {
  label: string;
  title: string;
  subtitle?: string;
  buttonClassName?: string;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = `modal-title-${label.replace(/\W+/g, "-").toLowerCase()}`;

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
        className={buttonClassName}
        onClick={() => {
          setSession((n) => n + 1);
          setOpen(true);
        }}
      >
        {label}
      </button>
      <dialog
        ref={ref}
        onClose={close}
        aria-labelledby={titleId}
        className="m-auto mb-0 max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-0 text-ink shadow-xl backdrop:bg-ink/40 sm:mb-auto sm:rounded-3xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-ink/10 bg-white px-5 py-3">
          <div>
            <h2 id={titleId} className="text-lg font-bold">
              {title}
            </h2>
            {subtitle && <p className="text-sm text-ink/55">{subtitle}</p>}
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
        <div key={session} className="px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {open && children(close)}
        </div>
      </dialog>
    </>
  );
}
