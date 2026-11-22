"use client";

// Create PDF options (not printed): which date, scheduled or all sections, and
// the Print / Save as PDF button, which opens the browser's print dialog.
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { DateField } from "@/components/admin/date-field";
import { Spinner } from "@/components/spinner";
import { ui } from "@/components/ui";
import type { PrintScope } from "@/lib/print";

export function PrintOptions({ date, scope, canPrint }: { date: string; scope: PrintScope; canPrint: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const go = (next: { date?: string; scope?: PrintScope }) => {
    const d = next.date ?? date;
    const s = next.scope ?? scope;
    startTransition(() => router.replace(`/print?date=${d}${s === "all" ? "&sections=all" : ""}`, { scroll: false }));
  };

  return (
    <div className={`${ui.card} flex flex-col gap-4 p-4 print:hidden`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <span className={ui.label}>Date</span>
          <DateField value={date} onChange={(d) => d && go({ date: d })} label="Sheet date" />
        </div>
        <div>
          <span className={ui.label}>Sections</span>
          <div className="flex h-12 gap-2" role="radiogroup" aria-label="Sections">
            {(
              [
                ["scheduled", "Scheduled that day"],
                ["all", "All sections"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={scope === value}
                onClick={() => go({ scope: value })}
                className={`flex-1 rounded-full text-sm font-semibold ${
                  scope === value ? "bg-ink text-white" : "bg-white text-ink/70 ring-1 ring-ink/20 active:bg-cream"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="button" onClick={() => window.print()} disabled={!canPrint || pending} className={`${ui.primary} whitespace-nowrap`}>
          Print / Save as PDF
        </button>
        {pending && <Spinner size={20} className="text-gold" />}
        <p className="text-sm text-ink/55">Choose &ldquo;Save as PDF&rdquo; in the print dialog to keep a file.</p>
      </div>
    </div>
  );
}
