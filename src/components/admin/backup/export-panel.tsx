"use client";

// Export: choose cafes and what to include, then download one backup file.
// Built in steps (base data, then history page by page) so no single response
// is too large.
import { useState } from "react";
import { exportBaseAction, exportHistoryAction } from "@/app/(app)/admin/backup/actions";
import { DateField } from "@/components/admin/date-field";
import { Spinner } from "@/components/spinner";
import { ui } from "@/components/ui";
import {
  countBackup,
  FORMAT,
  PART_LABELS,
  PARTS,
  VERSION,
  withDependencies,
  type Backup,
  type BackupSubmission,
  type Part,
} from "@/lib/transfer/format";
import { CheckRow, heading, panel, Progress, Summary } from "./bits";

export function ExportPanel({ cafes, today }: { cafes: { id: string; name: string }[]; today: string }) {
  const [cafeIds, setCafeIds] = useState<Set<string>>(() => new Set(cafes.map((c) => c.id)));
  const [chosen, setChosen] = useState<Set<Part>>(() => new Set(PARTS));
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState<ReturnType<typeof countBackup> | null>(null);

  const parts = withDependencies(chosen);
  const busy = progress !== null;
  const toggle = <T,>(set: Set<T>, v: T, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(v);
    else next.delete(v);
    return next;
  };

  async function download() {
    setError("");
    setDone(null);
    const opts = { cafeIds: [...cafeIds], parts: [...parts], from: parts.has("history") && from ? from : null, to: parts.has("history") && to ? to : null };
    try {
      setProgress({ done: 0, total: 1 });
      const base = await exportBaseAction(opts);
      const total = base.submissionCount + 1;
      setProgress({ done: 1, total });
      const submissions: BackupSubmission[] = [];
      let cursor: string | null = null;
      if (parts.has("history")) {
        do {
          const page: { submissions: BackupSubmission[]; nextCursor: string | null } = await exportHistoryAction(opts, cursor);
          submissions.push(...page.submissions);
          cursor = page.nextCursor;
          setProgress({ done: 1 + submissions.length, total });
        } while (cursor);
      }
      const backup: Backup = {
        format: FORMAT,
        version: VERSION,
        exportedAt: new Date().toISOString(),
        parts: [...parts],
        historyRange: parts.has("history") ? { from: opts.from, to: opts.to } : null,
        cafes: base.cafes,
        people: base.people,
        sections: base.sections,
        submissions,
        additions: base.additions,
      };
      const blob = new Blob([JSON.stringify(backup, null, 1)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kaizen-backup-${today}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setDone(countBackup(backup));
    } catch {
      setError("The export didn't finish. Check your connection and try again.");
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className={panel}>
      <div>
        <h2 className={heading}>Export</h2>
        <p className="text-sm text-ink/60">Download a backup file you can import here or into a new copy of the site.</p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className={ui.label}>Cafes</legend>
        {cafes.map((c) => (
          <CheckRow key={c.id} label={c.name} checked={cafeIds.has(c.id)} onChange={(on) => setCafeIds((s) => toggle(s, c.id, on))} disabled={busy} />
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className={ui.label}>What to include</legend>
        {PARTS.map((p) => {
          const forced = p !== "history" && chosen.has("history");
          return (
            <CheckRow
              key={p}
              label={PART_LABELS[p]}
              checked={parts.has(p)}
              disabled={busy || forced}
              note={
                forced
                  ? "Included because order history refers to it."
                  : p === "people"
                    ? "Names, PINs, managers, and roles at the chosen cafes."
                    : p === "sections"
                      ? "Sections, days, one-time dates, items, units and every min/max."
                      : "Every submission and count, Plenty, manual edits and “Added by”."
              }
              onChange={(on) => setChosen((s) => toggle(s, p, on))}
            />
          );
        })}
      </fieldset>

      {parts.has("history") && (
        <div>
          <span className={ui.label}>History dates (optional)</span>
          <div className="grid gap-2 sm:grid-cols-2">
            <DateRangeField label="From" value={from} onChange={setFrom} />
            <DateRangeField label="To" value={to} onChange={setTo} />
          </div>
          <p className="mt-1.5 text-sm text-ink/55">Leave both empty to include all history.</p>
        </div>
      )}

      <p className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
        {parts.has("people")
          ? "This file includes everyone's PINs. Keep it somewhere private."
          : "Keep backup files somewhere private."}
      </p>

      {progress && <Progress done={progress.done} total={progress.total} label="Preparing your file…" />}
      {error && <p className={ui.error}>{error}</p>}
      {done && (
        <div className="rounded-2xl bg-cream/60 p-3">
          <p className="font-semibold">Downloaded</p>
          <Summary counts={done} />
        </div>
      )}

      <div>
        <button type="button" onClick={download} disabled={busy || cafeIds.size === 0 || parts.size === 0} className={`${ui.primary} min-w-48`}>
          {busy ? <Spinner /> : "Download backup"}
        </button>
      </div>
    </div>
  );
}

function DateRangeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-sm text-ink/60">{label}</span>
      <div className="min-w-0 flex-1">
        <DateField value={value} onChange={onChange} label={`${label} date`} />
      </div>
      {value && (
        <button type="button" onClick={() => onChange("")} className="h-11 shrink-0 px-2 text-sm font-semibold text-ink/55">
          Clear
        </button>
      )}
    </div>
  );
}
