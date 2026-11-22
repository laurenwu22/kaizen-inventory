"use client";

// Import: read a backup file, choose cafes, parts and how to treat what's
// already here, preview exactly what will change, then import in batches.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  existingSubmissionsAction,
  importAdditionsAction,
  importBaseAction,
  importSubmissionsAction,
  previewImportAction,
} from "@/app/(app)/backup/actions";
import { Spinner } from "@/components/spinner";
import { ui } from "@/components/ui";
import {
  batchSubmissions,
  countBackup,
  parseBackup,
  PART_LABELS,
  PARTS,
  selectFromBackup,
  submissionProblem,
  withDependencies,
  type Backup,
  type Part,
} from "@/lib/transfer/format";
import type { BaseResult, ImportMode, Tally } from "@/lib/transfer/import";
import { CheckRow, heading, panel, Progress, Summary } from "./bits";

type Preview = BaseResult & { history: { add: number; here: number; skip: number }; additions: number };
type Done = { counts: BaseResult["counts"]; history: { added: number; skipped: number }; problems: string[] };

export function ImportPanel() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [backup, setBackup] = useState<Backup | null>(null);
  const [readError, setReadError] = useState("");
  const [cafeIds, setCafeIds] = useState<Set<string>>(new Set());
  const [chosen, setChosen] = useState<Set<Part>>(new Set());
  const [mode, setMode] = useState<ImportMode>("keep");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [working, setWorking] = useState<"preview" | "import" | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Done | null>(null);

  const available = new Set(backup?.parts ?? []);
  const parts = withDependencies(chosen);
  const reset = () => {
    setPreview(null);
    setError("");
    setDone(null);
  };
  const toggle = <T,>(set: Set<T>, v: T, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(v);
    else next.delete(v);
    return next;
  };

  async function onFile(file: File | undefined) {
    reset();
    setBackup(null);
    setReadError("");
    if (!file) return;
    setFileName(file.name);
    const parsed = parseBackup(await file.text());
    if ("error" in parsed) {
      setReadError(parsed.error);
      return;
    }
    setBackup(parsed.backup);
    setCafeIds(new Set(parsed.backup.cafes.map((c) => c.id)));
    setChosen(new Set(parsed.backup.parts));
  }

  async function runPreview() {
    if (!backup) return;
    reset();
    setWorking("preview");
    try {
      const sel = selectFromBackup(backup, cafeIds, parts);
      const r = await previewImportAction(sel.base, mode);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const here = new Set<string>();
      const ids = sel.submissions.map((s) => s.id);
      for (let i = 0; i < ids.length; i += 5000) {
        for (const id of await existingSubmissionsAction(ids.slice(i, i + 5000))) here.add(id);
      }
      let add = 0;
      let skip = 0;
      for (const s of sel.submissions) {
        if (here.has(s.id)) continue;
        if (submissionProblem(s, r.result.maps)) skip++;
        else add++;
      }
      setPreview({ ...r.result, history: { add, here: here.size, skip }, additions: sel.additions.length });
    } catch {
      setError("The preview didn't finish. Check your connection and try again.");
    } finally {
      setWorking(null);
    }
  }

  async function runImport() {
    if (!backup) return;
    setError("");
    setWorking("import");
    const sel = selectFromBackup(backup, cafeIds, parts);
    const batches = batchSubmissions(sel.submissions);
    const total = 1 + batches.length + 1;
    let step = 0;
    setProgress({ done: 0, total });
    try {
      const r = await importBaseAction(sel.base, mode);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setProgress({ done: ++step, total });
      const problems = [...r.result.problems];
      let added = 0;
      let skipped = 0;
      for (const batch of batches) {
        const h = await importSubmissionsAction(batch, r.result.maps);
        added += h.added;
        skipped += h.skipped;
        problems.push(...h.problems);
        setProgress({ done: ++step, total });
      }
      for (let i = 0; i < sel.additions.length; i += 5000) {
        await importAdditionsAction(sel.additions.slice(i, i + 5000), r.result.maps);
      }
      setProgress({ done: total, total });
      setDone({ counts: r.result.counts, history: { added, skipped }, problems });
      setPreview(null);
      router.refresh();
    } catch {
      setError(
        "The import stopped partway (connection or server problem). What was imported is saved. Run the import again with the same file to finish: anything already imported is skipped.",
      );
    } finally {
      setWorking(null);
      setProgress(null);
    }
  }

  return (
    <div className={panel}>
      <div>
        <h2 className={heading}>Import</h2>
        <p className="text-sm text-ink/60">Bring in a backup file. You&apos;ll see exactly what will change before anything is saved.</p>
      </div>

      <div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          id="backup-file"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <label htmlFor="backup-file" className={`${ui.secondary} cursor-pointer`}>
          {backup || readError ? "Choose a different file" : "Choose backup file"}
        </label>
        {fileName && <p className="mt-2 truncate text-sm text-ink/60">{fileName}</p>}
        {readError && <p className={ui.error}>{readError}</p>}
      </div>

      {backup && (
        <>
          <div className="rounded-2xl bg-cream/60 p-3">
            <p className="font-semibold">
              Backup from{" "}
              {new Date(backup.exportedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
            </p>
            <Summary counts={countBackup(backup)} />
            {backup.historyRange && (backup.historyRange.from || backup.historyRange.to) && (
              <p className="text-sm text-ink/60">
                History {backup.historyRange.from ?? "start"} to {backup.historyRange.to ?? "end"}
              </p>
            )}
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className={ui.label}>Cafes to import</legend>
            {backup.cafes.map((c) => (
              <CheckRow
                key={c.id}
                label={c.name}
                checked={cafeIds.has(c.id)}
                disabled={!!working}
                onChange={(on) => {
                  reset();
                  setCafeIds((s) => toggle(s, c.id, on));
                }}
              />
            ))}
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className={ui.label}>What to import</legend>
            {PARTS.filter((p) => available.has(p)).map((p) => {
              const forced = p !== "history" && chosen.has("history");
              return (
                <CheckRow
                  key={p}
                  label={PART_LABELS[p]}
                  checked={parts.has(p)}
                  disabled={!!working || forced}
                  note={forced ? "Included because order history refers to it." : undefined}
                  onChange={(on) => {
                    reset();
                    setChosen((s) => toggle(s, p, on));
                  }}
                />
              );
            })}
            {PARTS.some((p) => !available.has(p)) && (
              <p className="text-sm text-ink/55">
                Not in this file: {PARTS.filter((p) => !available.has(p)).map((p) => PART_LABELS[p].toLowerCase()).join(", ")}.
              </p>
            )}
          </fieldset>

          <fieldset>
            <legend className={ui.label}>If something is already here</legend>
            <div className="flex flex-col gap-2" role="radiogroup">
              {(
                [
                  ["keep", "Keep what's here", "Only add what's missing. Nothing here is changed."],
                  ["update", "Update to match the file", "Matching people, sections, items and amounts are overwritten."],
                ] as const
              ).map(([value, label, note]) => (
                <label
                  key={value}
                  className={`flex items-start gap-3 rounded-2xl px-3 py-2.5 ring-1 ${
                    mode === value ? "bg-white ring-ink/30" : "bg-cream/50 ring-ink/10"
                  }`}
                >
                  <input
                    type="radio"
                    name="import-mode"
                    checked={mode === value}
                    disabled={!!working}
                    onChange={() => {
                      reset();
                      setMode(value);
                    }}
                    className="mt-1 h-4 w-4 shrink-0 accent-[#23211e]"
                  />
                  <span>
                    <span className="block font-semibold">{label}</span>
                    <span className="block text-sm text-ink/55">{note}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-sm text-ink/55">Order history is never changed or doubled: submissions already here are skipped.</p>
          </fieldset>

          {preview && <PreviewCard preview={preview} />}
          {progress && <Progress done={progress.done} total={progress.total} label="Importing…" />}
          {error && <p className={ui.error}>{error}</p>}

          <div className="flex flex-wrap gap-3">
            {!preview ? (
              <button
                type="button"
                onClick={runPreview}
                disabled={!!working || cafeIds.size === 0 || parts.size === 0}
                className={`${ui.primary} min-w-44`}
              >
                {working === "preview" ? <Spinner /> : "Preview import"}
              </button>
            ) : (
              <>
                <button type="button" onClick={runImport} disabled={!!working} className={`${ui.primary} min-w-36`}>
                  {working === "import" ? <Spinner /> : "Import"}
                </button>
                <button type="button" onClick={reset} disabled={!!working} className="h-12 px-3 text-sm font-semibold text-ink/60">
                  Cancel
                </button>
              </>
            )}
          </div>
        </>
      )}

      {done && <DoneCard done={done} />}
    </div>
  );
}

function tallyText(t: Tally, one: string, many: string) {
  const w = (n: number) => (n === 1 ? one : many);
  const bits = [];
  if (t.added) bits.push(`${t.added} new`);
  if (t.updated) bits.push(`${t.updated} updated`);
  if (t.kept) bits.push(`${t.kept} already here`);
  const total = t.added + t.updated + t.kept;
  return total === 0 ? null : `${total} ${w(total)}: ${bits.join(", ")}`;
}

function CountsList({ counts }: { counts: BaseResult["counts"] }) {
  const rows = [
    tallyText(counts.cafes, "cafe", "cafes"),
    tallyText(counts.people, "person", "people"),
    tallyText(counts.sections, "section", "sections"),
    tallyText(counts.items, "item", "items"),
  ].filter(Boolean);
  return (
    <>
      {rows.map((r) => (
        <li key={r}>{r}</li>
      ))}
    </>
  );
}

function Problems({ problems }: { problems: string[] }) {
  if (problems.length === 0) return null;
  return (
    <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
      <p className="font-semibold">
        {problems.length} {problems.length === 1 ? "problem" : "problems"}
      </p>
      <ul className="mt-1 list-disc pl-5">
        {problems.slice(0, 20).map((p, i) => (
          <li key={i}>{p}</li>
        ))}
        {problems.length > 20 && <li>…and {problems.length - 20} more</li>}
      </ul>
    </div>
  );
}

function PreviewCard({ preview }: { preview: Preview }) {
  const h = preview.history;
  return (
    <div className="rounded-2xl bg-white p-4 ring-2 ring-gold/60">
      <p className="font-semibold">Here&apos;s what will happen</p>
      <ul className="mt-2 list-disc pl-5 text-sm text-ink/75">
        <CountsList counts={preview.counts} />
        {h.add + h.here + h.skip > 0 && (
          <li>
            {h.add} {h.add === 1 ? "submission" : "submissions"} to add
            {h.here ? `, ${h.here} already here` : ""}
            {h.skip ? `, ${h.skip} can't be added` : ""}
          </li>
        )}
      </ul>
      <Problems problems={preview.problems} />
      <p className="mt-3 text-sm text-ink/55">Nothing has been saved yet.</p>
    </div>
  );
}

function DoneCard({ done }: { done: Done }) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-2 ring-green-700/40">
      <p className="font-semibold text-green-900">Import finished</p>
      <ul className="mt-2 list-disc pl-5 text-sm text-ink/75">
        <CountsList counts={done.counts} />
        {(done.history.added > 0 || done.history.skipped > 0) && (
          <li>
            {done.history.added} {done.history.added === 1 ? "submission" : "submissions"} added
            {done.history.skipped ? `, ${done.history.skipped} already here` : ""}
          </li>
        )}
      </ul>
      <Problems problems={done.problems} />
    </div>
  );
}
