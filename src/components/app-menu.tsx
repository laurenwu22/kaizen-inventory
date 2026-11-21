"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOut } from "@/app/actions/auth";
import { PendingButton } from "./spinner";

export type MenuItem = { label: string; href?: string };

// Hamburger menu: user's name at the top, app links in the middle, Sign out at
// the bottom. Items without an href are shown disabled ("Soon") until built.
export function AppMenu({
  userName,
  cafeName,
  items,
}: {
  userName: string;
  cafeName: string;
  items: MenuItem[];
}) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-haspopup="dialog"
        className="-mr-2 flex h-11 w-11 items-center justify-center rounded-xl text-ink/80 active:bg-cream"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        // Clicking the backdrop (outside the panel) closes the menu.
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(false);
        }}
        aria-label="Menu"
        className="fixed inset-y-0 right-0 left-auto m-0 h-full max-h-none w-80 max-w-[85vw] bg-white p-0 text-ink shadow-xl backdrop:bg-ink/40"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-ink/10 bg-cream px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-5">
            <div className="min-w-0">
              <p className="truncate text-lg font-bold">{userName}</p>
              <p className="truncate text-sm text-gold">{cafeName}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="-mt-2 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink/70 active:bg-cream"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-3">
            <ul className="flex flex-col gap-1">
              {items.map((item) => (
                <li key={item.label}>
                  {item.href ? (
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="flex h-12 items-center rounded-xl px-3 font-medium text-ink active:bg-cream"
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <span
                      aria-disabled="true"
                      className="flex h-12 items-center justify-between rounded-xl px-3 font-medium text-ink/40"
                    >
                      {item.label}
                      <span className="text-xs font-normal">Soon</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </nav>

          <form
            action={signOut}
            className="border-t border-ink/10 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          >
            <PendingButton className="flex h-12 w-full items-center rounded-xl px-3 font-medium text-red-600 active:bg-red-50">
              Sign out
            </PendingButton>
          </form>
        </div>
      </dialog>
    </>
  );
}
