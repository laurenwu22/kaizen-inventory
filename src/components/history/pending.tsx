"use client";

// Order history loading state. Changing the date or month keeps the old page
// on screen while the new one loads, so the day's order is dimmed with a
// spinner over it until the new one arrives.
import { createContext, useCallback, useContext, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLinkStatus } from "next/link";
import { Spinner } from "@/components/spinner";

type Ctx = { pending: boolean; report: (delta: number) => void; go: (href: string) => void };
const PendingContext = createContext<Ctx>({ pending: false, report: () => {}, go: () => {} });

export function HistoryPendingProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [transitioning, startTransition] = useTransition();
  const [links, setLinks] = useState(0);
  const report = useCallback((delta: number) => setLinks((n) => Math.max(0, n + delta)), []);
  const go = useCallback(
    (href: string) => startTransition(() => router.push(href, { scroll: false })),
    [router],
  );
  return (
    <PendingContext.Provider value={{ pending: transitioning || links > 0, report, go }}>{children}</PendingContext.Provider>
  );
}

export const useHistoryNav = () => useContext(PendingContext);

/** Put inside a history <Link>: tells the page while that link is loading. */
export function ReportPending() {
  const { pending } = useLinkStatus();
  const { report } = useContext(PendingContext);
  useEffect(() => {
    if (!pending) return;
    report(1);
    return () => report(-1);
  }, [pending, report]);
  return null;
}

/** Dims its contents and shows a spinner while history is loading. */
export function PendingArea({ children }: { children: React.ReactNode }) {
  const { pending } = useContext(PendingContext);
  return (
    <div className="relative" aria-busy={pending}>
      <div className={`transition-opacity duration-150 ${pending ? "opacity-35" : ""}`}>{children}</div>
      {pending && (
        <div className="absolute inset-x-0 top-0 flex justify-center pt-16 text-gold" aria-live="polite">
          <span className="rounded-full bg-white p-3 shadow-md ring-1 ring-ink/10">
            <Spinner size={32} />
          </span>
          <span className="sr-only">Loading</span>
        </div>
      )}
    </div>
  );
}

/** Small spinner shown next to a heading while history is loading. */
export function PendingDot() {
  const { pending } = useContext(PendingContext);
  return pending ? <Spinner size={18} className="text-gold" /> : null;
}
